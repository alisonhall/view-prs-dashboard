const path = require("path");

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createViewPrsSchedulerHelpers = ({
  fs,
  console,
  parseTimestamp,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  readViewPrsData,
  defaultViewPrsRepo,
  viewPrsAutoIntervalMs,
  viewPrsManualCooldownMs,
  viewPrsQuickCheckIntervalMs = 5 * 60 * 1000,
  viewPrsMergedFullSweepIntervalMs = 30 * 60 * 1000,
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  viewPrsLegacySchedulerFile,
}) => {
  const getManualCooldownSkipReason = ({
    nowMs,
    lastManualRunAt,
    manualCooldownMs = viewPrsManualCooldownMs,
  }) => {
    const manualRunMs = parseTimestamp(lastManualRunAt);
    if (manualRunMs === null) {
      return null;
    }

    if (nowMs - manualRunMs < manualCooldownMs) {
      return "manual run happened within the last 15 minutes";
    }

    return null;
  };

  const readViewPrsSchedulerState = () => {
    let schedulerFileToRead = viewPrsSchedulerFile;
    if (!fs.existsSync(viewPrsSchedulerFile)) {
      if (fs.existsSync(viewPrsLegacySchedulerFile)) {
        schedulerFileToRead = viewPrsLegacySchedulerFile;
      } else {
        return;
      }
    }

    try {
      const raw = fs.readFileSync(schedulerFileToRead, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        return;
      }

      if (typeof parsed.lastManualRunAt === "string") {
        viewPrsSchedulerState.lastManualRunAt = parsed.lastManualRunAt;
      }

      if (typeof parsed.lastAutoRunAt === "string") {
        viewPrsSchedulerState.lastAutoRunAt = parsed.lastAutoRunAt;
      }

      if (typeof parsed.lastQuickCheckAt === "string") {
        viewPrsSchedulerState.lastQuickCheckAt = parsed.lastQuickCheckAt;
      }

      if (typeof parsed.lastMergedDrainAt === "string") {
        viewPrsSchedulerState.lastMergedDrainAt = parsed.lastMergedDrainAt;
      }

      if (isPlainObject(parsed.pendingByRepo)) {
        viewPrsSchedulerState.pendingByRepo = parsed.pendingByRepo;
      }

      if (schedulerFileToRead === viewPrsLegacySchedulerFile) {
        persistViewPrsSchedulerState();
      }
    } catch (error) {
      console.warn(
        `Unable to read scheduler state at ${schedulerFileToRead}: ${error.message}`,
      );
    }
  };

  const persistViewPrsSchedulerState = () => {
    const persisted = {
      lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
      lastAutoRunAt: viewPrsSchedulerState.lastAutoRunAt,
      lastQuickCheckAt: viewPrsSchedulerState.lastQuickCheckAt || null,
      lastMergedDrainAt: viewPrsSchedulerState.lastMergedDrainAt || null,
      pendingByRepo: viewPrsSchedulerState.pendingByRepo || {},
    };

    try {
      fs.mkdirSync(path.dirname(viewPrsSchedulerFile), { recursive: true });
      fs.writeFileSync(
        viewPrsSchedulerFile,
        `${JSON.stringify(persisted, null, 2)}\n`,
        "utf8",
      );
    } catch (error) {
      console.warn(
        `Unable to write scheduler state at ${viewPrsSchedulerFile}: ${error.message}`,
      );
    }
  };

  const setLastManualRunNow = () => {
    viewPrsSchedulerState.lastManualRunAt = new Date().toISOString();
    viewPrsSchedulerState.lastAutoSkipReason = null;
    persistViewPrsSchedulerState();
  };

  const getPendingCounts = () => {
    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    let pendingOpenCount = 0;
    let pendingMergedClosedCount = 0;
    Object.values(pendingByRepo).forEach((entry) => {
      pendingOpenCount += Array.isArray(entry?.open) ? entry.open.length : 0;
      pendingMergedClosedCount += Array.isArray(entry?.mergedClosed)
        ? entry.mergedClosed.length
        : 0;
    });
    return { pendingOpenCount, pendingMergedClosedCount };
  };

  const getViewPrsSchedulerPublicState = () => ({
    activePrNumbers: Array.isArray(viewPrsSchedulerState.activePrNumbers)
      ? viewPrsSchedulerState.activePrNumbers
        .map((prNumber) => String(prNumber || "").trim())
        .filter((prNumber) => /^\d+$/.test(prNumber))
      : [],
    intervalMinutes: Math.round(viewPrsAutoIntervalMs / 60000),
    manualCooldownMinutes: Math.round(viewPrsManualCooldownMs / 60000),
    quickCheckIntervalMinutes: Math.max(
      1,
      Math.round(viewPrsQuickCheckIntervalMs / 60000),
    ),
    mergedFullSweepIntervalMinutes: Math.max(
      1,
      Math.round(viewPrsMergedFullSweepIntervalMs / 60000),
    ),
    autoCircuitFailureThreshold: viewPrsAutoCircuitFailureThreshold,
    autoCircuitCooldownMinutes: Math.round(viewPrsAutoCircuitCooldownMs / 60000),
    startedAt: viewPrsSchedulerState.startedAt,
    isAutoRunInProgress: viewPrsSchedulerState.isAutoRunInProgress,
    lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
    lastAutoAttemptAt: viewPrsSchedulerState.lastAutoAttemptAt,
    lastAutoRunAt: viewPrsSchedulerState.lastAutoRunAt,
    lastAutoSkipReason: viewPrsSchedulerState.lastAutoSkipReason,
    lastAutoError: viewPrsSchedulerState.lastAutoError,
    lastQuickCheckAt: viewPrsSchedulerState.lastQuickCheckAt || null,
    lastQuickCheckError: viewPrsSchedulerState.lastQuickCheckError || null,
    lastMergedDrainAt: viewPrsSchedulerState.lastMergedDrainAt || null,
    ...getPendingCounts(),
    consecutiveAutoFailures: viewPrsSchedulerState.consecutiveAutoFailures,
    autoCircuitOpenUntil: viewPrsSchedulerState.autoCircuitOpenUntil,
    lastAutoCircuitOpenedAt: viewPrsSchedulerState.lastAutoCircuitOpenedAt,
  });

  // --- Pending-update queue (populated by quick-check, drained by full fetch) ---

  const setPendingForRepo = (repo, { open = [], mergedClosed = [] } = {}) => {
    const safeRepo = toTrimmedString(repo);
    if (!isRepoSlug(safeRepo)) {
      return;
    }
    const normalizeNumbers = (list) =>
      Array.from(
        new Set(
          (Array.isArray(list) ? list : [])
            .map((value) => String(value || "").trim())
            .filter((value) => /^\d+$/.test(value)),
        ),
      );

    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    const existing = pendingByRepo[safeRepo] || { open: [], mergedClosed: [] };
    pendingByRepo[safeRepo] = {
      // Union with anything already queued but not yet drained by a full
      // fetch, so a repeated quick-check never drops a pending PR.
      open: normalizeNumbers([...(existing.open || []), ...open]),
      mergedClosed: normalizeNumbers([
        ...(existing.mergedClosed || []),
        ...mergedClosed,
      ]),
      detectedAt: new Date().toISOString(),
    };
    viewPrsSchedulerState.pendingByRepo = pendingByRepo;
  };

  const clearPendingForRepo = (repo, { onlyMergedClosed = false } = {}) => {
    const safeRepo = toTrimmedString(repo);
    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    if (!pendingByRepo[safeRepo]) {
      return;
    }
    if (onlyMergedClosed) {
      pendingByRepo[safeRepo] = {
        ...pendingByRepo[safeRepo],
        mergedClosed: [],
      };
      return;
    }
    delete pendingByRepo[safeRepo];
  };

  const getReposWithPendingOpen = () => {
    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    return Object.entries(pendingByRepo)
      .filter(([, entry]) => Array.isArray(entry?.open) && entry.open.length > 0)
      .map(([repo]) => repo);
  };

  const getReposWithPendingMergedClosed = () => {
    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    return Object.entries(pendingByRepo)
      .filter(
        ([, entry]) =>
          Array.isArray(entry?.mergedClosed) && entry.mergedClosed.length > 0,
      )
      .map(([repo]) => repo);
  };

  const getPendingUpdatePrNumberKeys = () => {
    const pendingByRepo = viewPrsSchedulerState.pendingByRepo || {};
    const keys = new Set();
    Object.entries(pendingByRepo).forEach(([repo, entry]) => {
      [...(entry?.open || []), ...(entry?.mergedClosed || [])].forEach(
        (prNumber) => {
          keys.add(`${repo}#${prNumber}`);
        },
      );
    });
    return keys;
  };

  const getViewPrsAutoCircuitOpenState = ({
    nowMs = Date.now(),
    autoCircuitOpenUntil = viewPrsSchedulerState.autoCircuitOpenUntil,
  } = {}) => {
    const circuitOpenUntilMs = parseTimestamp(autoCircuitOpenUntil);
    if (circuitOpenUntilMs === null || nowMs >= circuitOpenUntilMs) {
      return {
        isOpen: false,
        openUntilIso: null,
      };
    }

    return {
      isOpen: true,
      openUntilIso: new Date(circuitOpenUntilMs).toISOString(),
    };
  };

  const buildAckRefreshBudgetSkipErrors = ({
    refreshList = [],
    startIndex = 0,
    totalRefreshBudgetMs = viewPrsAckTotalRefreshTimeoutMs,
  } = {}) => {
    const safeList = Array.isArray(refreshList) ? refreshList : [];
    const safeStartIndex = Math.max(
      0,
      Number.isFinite(Number(startIndex)) ? Number(startIndex) : 0,
    );

    return safeList.slice(safeStartIndex).map((remainingPrNumber) => ({
      prNumber: remainingPrNumber,
      error: `Skipped: total ack refresh budget exceeded after ${Math.round(
        totalRefreshBudgetMs / 1000,
      )}s`,
    }));
  };

  const recordViewPrsAutoRefreshFailure = () => {
    viewPrsSchedulerState.consecutiveAutoFailures += 1;
    if (
      viewPrsSchedulerState.consecutiveAutoFailures >=
      viewPrsAutoCircuitFailureThreshold
    ) {
      const openUntilMs = Date.now() + viewPrsAutoCircuitCooldownMs;
      const openUntilIso = new Date(openUntilMs).toISOString();
      const openedAtIso = new Date().toISOString();
      viewPrsSchedulerState.autoCircuitOpenUntil = openUntilIso;
      viewPrsSchedulerState.lastAutoCircuitOpenedAt = openedAtIso;
      viewPrsSchedulerState.lastAutoSkipReason = `auto refresh circuit open until ${openUntilIso} after ${viewPrsSchedulerState.consecutiveAutoFailures} consecutive failure(s)`;
    }
  };

  const resetViewPrsAutoRefreshFailureState = () => {
    viewPrsSchedulerState.consecutiveAutoFailures = 0;
    viewPrsSchedulerState.autoCircuitOpenUntil = null;
  };

  const getViewPrsAutoRefreshRepos = (
    data = readViewPrsData(),
    extraReposRaw = process.env.VIEW_PRS_AUTO_REPOS || "",
  ) => {
    const repos = [];
    const seen = new Set();
    const isPlaceholderRepoSlug = (repo) =>
      toTrimmedString(repo).toLowerCase() === "owner/repo";

    const addRepo = (repo) => {
      const normalizedRepo = toTrimmedString(repo);
      if (
        !isRepoSlug(normalizedRepo) ||
        isPlaceholderRepoSlug(normalizedRepo) ||
        seen.has(normalizedRepo)
      ) {
        return;
      }
      seen.add(normalizedRepo);
      repos.push(normalizedRepo);
    };

    parseRepoCsv(extraReposRaw).forEach(addRepo);

    Object.values(data?.byPrNumber || {}).forEach((entry) => {
      addRepo(entry?.repo);
    });

    addRepo(data?.lastRun?.repo);

    // Only fall back to the hardcoded default repo when nothing else names a
    // repo at all (e.g. a brand-new install with no stored data yet and no
    // VIEW_PRS_AUTO_REPOS override) — otherwise a machine that has always
    // tracked a different repo would silently have this unrelated one
    // auto-refreshed alongside it too.
    if (repos.length === 0) {
      addRepo(defaultViewPrsRepo);
    }

    return repos;
  };

  return {
    getManualCooldownSkipReason,
    readViewPrsSchedulerState,
    persistViewPrsSchedulerState,
    setLastManualRunNow,
    getViewPrsSchedulerPublicState,
    getViewPrsAutoCircuitOpenState,
    buildAckRefreshBudgetSkipErrors,
    recordViewPrsAutoRefreshFailure,
    resetViewPrsAutoRefreshFailureState,
    getViewPrsAutoRefreshRepos,
    setPendingForRepo,
    clearPendingForRepo,
    getReposWithPendingOpen,
    getReposWithPendingMergedClosed,
    getPendingUpdatePrNumberKeys,
  };
};

module.exports = {
  createViewPrsSchedulerHelpers,
};
