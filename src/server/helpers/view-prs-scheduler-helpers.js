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
  // () => dispatcher-derived public-state fields (isXInProgress/lastXAt/
  // dispatcherQueue - see view-prs-dispatcher-helpers.js's
  // getPublicStateFields). Defaults to a no-op since the dispatcher helpers
  // factory itself depends on getViewPrsAutoRefreshRepos FROM this one -
  // app.js constructs this factory first, then the dispatcher's, then
  // supplies the real function via a late-bound reference (see app.js's
  // own comment at the call site) to avoid a circular construction order.
  getDispatcherDerivedFields = () => ({}),
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

      // Per-repo dispatcher registry (see view-prs-dispatcher-helpers.js) -
      // a plain data copy only. A persisted file without dispatcherVersion:2
      // (i.e. written before the dispatcher existed) is left alone here -
      // app.js's own startup sequence detects the still-missing
      // viewPrsSchedulerState.dispatcher and performs the one-time
      // legacy-shape migration itself (see migrateDispatcherStateIfNeeded),
      // since that migration needs getViewPrsAutoRefreshRepos, which would
      // otherwise create a circular dependency between this factory and
      // createViewPrsDispatcherHelpers.
      if (parsed.dispatcherVersion === 2 && isPlainObject(parsed.entries)) {
        const entries = {};
        Object.entries(parsed.entries).forEach(([key, entry]) => {
          if (!isPlainObject(entry)) {
            return;
          }
          // priority/intervalMs are deliberately absent from the persisted
          // shape (always re-derived live) and get filled in by the next
          // getOrInitRegistry() call's recomputeEntryConfig - placeholder
          // 0s here are never read before that happens, since app.js's
          // startup sequence always calls getOrInitRegistry() right after
          // loading this state.
          entries[key] = {
            repo: entry.repo,
            taskType: entry.taskType,
            priority: 0,
            intervalMs: 0,
            nextDueAt: entry.nextDueAt || new Date().toISOString(),
            lastStartedAt: null,
            lastFinishedAt: entry.lastFinishedAt || null,
            lastOk: typeof entry.lastOk === "boolean" ? entry.lastOk : null,
            lastError: entry.lastError || null,
            isRunning: false,
            runCount: Number(entry.runCount) || 0,
            consecutiveFailureCount: Number(entry.consecutiveFailureCount) || 0,
          };
        });
        viewPrsSchedulerState.dispatcher = { entries, reservedGhSlots: 0 };
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

  // Strips priority/intervalMs (and the transient isRunning/lastStartedAt
  // fields) before persisting a dispatcher entry - those are always
  // re-derived live from schedulerRepoConfig + defaults on load (see
  // view-prs-dispatcher-helpers.js's recomputeEntryConfig), and isRunning
  // must never survive a restart as `true` with no process actually running
  // it. Only run-history needs to survive a restart.
  const getPersistableDispatcherEntries = () => {
    const entries = viewPrsSchedulerState.dispatcher?.entries || {};
    const persistable = {};
    Object.entries(entries).forEach(([key, entry]) => {
      persistable[key] = {
        repo: entry.repo,
        taskType: entry.taskType,
        nextDueAt: entry.nextDueAt,
        lastFinishedAt: entry.lastFinishedAt,
        lastOk: entry.lastOk,
        lastError: entry.lastError,
        runCount: entry.runCount || 0,
        consecutiveFailureCount: entry.consecutiveFailureCount || 0,
      };
    });
    return persistable;
  };

  const persistViewPrsSchedulerState = () => {
    const persisted = {
      lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
      lastAutoRunAt: viewPrsSchedulerState.lastAutoRunAt,
      lastQuickCheckAt: viewPrsSchedulerState.lastQuickCheckAt || null,
      lastMergedDrainAt: viewPrsSchedulerState.lastMergedDrainAt || null,
      pendingByRepo: viewPrsSchedulerState.pendingByRepo || {},
      dispatcherVersion: 2,
      entries: getPersistableDispatcherEntries(),
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

  const getViewPrsSchedulerPublicState = () => {
    // isXInProgress/lastXAt are now derived from the dispatcher's own
    // per-repo registry (see view-prs-dispatcher-helpers.js's
    // getPublicStateFields) rather than read directly off the flat
    // viewPrsSchedulerState fields - those flat fields reflected only
    // whichever single repo most recently ran, which stopped being
    // meaningful once multiple repos' entries can be in flight at once.
    // The field NAMES are unchanged for backward compatibility with
    // existing frontend/test consumers. Falls back to the flat fields
    // (today's old behavior) if the dispatcher isn't wired - defensive
    // only, every real caller supplies it (see app.js).
    const dispatcherFields = getDispatcherDerivedFields() || {};

    return {
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
      isAutoRunInProgress:
        dispatcherFields.isAutoRunInProgress ?? viewPrsSchedulerState.isAutoRunInProgress,
      isQuickCheckInProgress:
        dispatcherFields.isQuickCheckInProgress ?? viewPrsSchedulerState.isQuickCheckInProgress,
      quickCheckSkippedWhileAutoRunInProgress:
        viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress,
      isMergedDrainInProgress:
        dispatcherFields.isMergedDrainInProgress ?? viewPrsSchedulerState.isMergedDrainInProgress,
      lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
      lastAutoAttemptAt: viewPrsSchedulerState.lastAutoAttemptAt,
      lastAutoRunAt: dispatcherFields.lastAutoRunAt ?? viewPrsSchedulerState.lastAutoRunAt,
      lastAutoSkipReason: viewPrsSchedulerState.lastAutoSkipReason,
      lastAutoError: viewPrsSchedulerState.lastAutoError,
      lastQuickCheckAt:
        dispatcherFields.lastQuickCheckAt ?? (viewPrsSchedulerState.lastQuickCheckAt || null),
      lastQuickCheckAttemptAt: viewPrsSchedulerState.lastQuickCheckAttemptAt || null,
      lastQuickCheckSkipReason: viewPrsSchedulerState.lastQuickCheckSkipReason || null,
      lastQuickCheckError: viewPrsSchedulerState.lastQuickCheckError || null,
      lastMergedDrainAt:
        dispatcherFields.lastMergedDrainAt ?? (viewPrsSchedulerState.lastMergedDrainAt || null),
      ...getPendingCounts(),
      consecutiveAutoFailures: viewPrsSchedulerState.consecutiveAutoFailures,
      autoCircuitOpenUntil: viewPrsSchedulerState.autoCircuitOpenUntil,
      lastAutoCircuitOpenedAt: viewPrsSchedulerState.lastAutoCircuitOpenedAt,
      // New: the dispatcher's real, ordered upcoming/running task list -
      // see the Activity drawer's ActivityDrawerDispatcherSection.
      dispatcherQueue: Array.isArray(dispatcherFields.dispatcherQueue)
        ? dispatcherFields.dispatcherQueue
        : [],
    };
  };

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
