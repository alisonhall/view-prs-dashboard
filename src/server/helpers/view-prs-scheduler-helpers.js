const path = require("path");

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

  const getViewPrsSchedulerPublicState = () => ({
    activePrNumbers: Array.isArray(viewPrsSchedulerState.activePrNumbers)
      ? viewPrsSchedulerState.activePrNumbers
        .map((prNumber) => String(prNumber || "").trim())
        .filter((prNumber) => /^\d+$/.test(prNumber))
      : [],
    intervalMinutes: Math.round(viewPrsAutoIntervalMs / 60000),
    manualCooldownMinutes: Math.round(viewPrsManualCooldownMs / 60000),
    autoCircuitFailureThreshold: viewPrsAutoCircuitFailureThreshold,
    autoCircuitCooldownMinutes: Math.round(viewPrsAutoCircuitCooldownMs / 60000),
    startedAt: viewPrsSchedulerState.startedAt,
    isAutoRunInProgress: viewPrsSchedulerState.isAutoRunInProgress,
    lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
    lastAutoAttemptAt: viewPrsSchedulerState.lastAutoAttemptAt,
    lastAutoRunAt: viewPrsSchedulerState.lastAutoRunAt,
    lastAutoSkipReason: viewPrsSchedulerState.lastAutoSkipReason,
    lastAutoError: viewPrsSchedulerState.lastAutoError,
    consecutiveAutoFailures: viewPrsSchedulerState.consecutiveAutoFailures,
    autoCircuitOpenUntil: viewPrsSchedulerState.autoCircuitOpenUntil,
    lastAutoCircuitOpenedAt: viewPrsSchedulerState.lastAutoCircuitOpenedAt,
  });

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

    addRepo(defaultViewPrsRepo);
    addRepo(data?.lastRun?.repo);

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
  };
};

module.exports = {
  createViewPrsSchedulerHelpers,
};
