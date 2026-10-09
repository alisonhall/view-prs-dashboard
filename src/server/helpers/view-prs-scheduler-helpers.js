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
      // The specific repos currently circuit-broken (per-repo breaker, see
      // autoCircuitByRepo's own comment near viewPrsSchedulerState's
      // definition) - lets the Activity drawer show which repo(s) a
      // "Reset circuit breaker" action would actually affect, rather than
      // just the global worst-case aggregates above.
      openAutoCircuitRepos: getOpenAutoCircuitRepos(),
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

  // Per-repo circuit breaker (deliberately separate from the dispatcher's
  // own per-(repo, taskType) consecutiveFailureCount/backoff in
  // view-prs-dispatcher-helpers.js's markEntryFinished): that mechanism is a
  // soft "push this entry's next run further out" scheduling nudge: it
  // never fully stops a repo's work, and isn't surfaced to the user. This
  // one is a hard "stop entirely for N minutes" safety stop per repo,
  // surfaced in the public scheduler state and manually resettable (see
  // resetAutoCircuitBreaker below) - e.g. for when a laptop sleeping/locking
  // caused a burst of failures that shouldn't count once it's back. Don't
  // conflate the two.
  const ensureAutoCircuitEntry = (repo) => {
    if (!isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)) {
      viewPrsSchedulerState.autoCircuitByRepo = {};
    }
    if (!isPlainObject(viewPrsSchedulerState.autoCircuitByRepo[repo])) {
      viewPrsSchedulerState.autoCircuitByRepo[repo] = {
        consecutiveFailures: 0,
        circuitOpenUntil: null,
        lastCircuitOpenedAt: null,
      };
    }
    return viewPrsSchedulerState.autoCircuitByRepo[repo];
  };

  // The flat consecutiveAutoFailures/autoCircuitOpenUntil/lastAutoCircuitOpenedAt
  // fields stay as back-compat aggregates (existing consumers - the public
  // scheduler-state shape, pr-applied-summary.helpers.js's "Last auto skip"
  // text - keep working unchanged): the worst case across every repo
  // (highest failure count; soonest-still-open circuit, if any).
  const recomputeAutoCircuitAggregates = () => {
    const byRepo = isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)
      ? viewPrsSchedulerState.autoCircuitByRepo
      : {};
    let maxFailures = 0;
    let latestOpenUntilIso = null;
    let latestOpenUntilMs = null;
    let latestOpenedAtIso = null;
    Object.values(byRepo).forEach((entry) => {
      if (Number(entry.consecutiveFailures) > maxFailures) {
        maxFailures = Number(entry.consecutiveFailures);
      }
      const openUntilMs = parseTimestamp(entry.circuitOpenUntil);
      if (openUntilMs !== null && (latestOpenUntilMs === null || openUntilMs > latestOpenUntilMs)) {
        latestOpenUntilMs = openUntilMs;
        latestOpenUntilIso = entry.circuitOpenUntil;
        latestOpenedAtIso = entry.lastCircuitOpenedAt;
      }
    });
    viewPrsSchedulerState.consecutiveAutoFailures = maxFailures;
    viewPrsSchedulerState.autoCircuitOpenUntil = latestOpenUntilIso;
    viewPrsSchedulerState.lastAutoCircuitOpenedAt = latestOpenedAtIso;
  };

  // Read-only lookup - unlike ensureAutoCircuitEntry, never creates an
  // entry just from being checked (checking happens far more often than
  // failing, so this avoids persisting an empty breaker entry for every
  // repo that's ever simply been looked at).
  const getAutoCircuitOpenUntilForRepo = (repo) => {
    const byRepo = isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)
      ? viewPrsSchedulerState.autoCircuitByRepo
      : {};
    return byRepo[repo]?.circuitOpenUntil ?? null;
  };

  const getOpenAutoCircuitRepos = ({ nowMs = Date.now() } = {}) => {
    const byRepo = isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)
      ? viewPrsSchedulerState.autoCircuitByRepo
      : {};
    return Object.keys(byRepo).filter((repo) => {
      const openUntilMs = parseTimestamp(byRepo[repo].circuitOpenUntil);
      return openUntilMs !== null && nowMs < openUntilMs;
    });
  };

  // `repo` resolves against the per-repo breaker; `autoCircuitOpenUntil`
  // can still be passed directly (existing pure-logic tests do this) and
  // takes precedence over both - preserved for backward compat.
  const getViewPrsAutoCircuitOpenState = ({
    nowMs = Date.now(),
    repo,
    autoCircuitOpenUntil = repo
      ? getAutoCircuitOpenUntilForRepo(repo)
      : viewPrsSchedulerState.autoCircuitOpenUntil,
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

  // Takes the repos that ACTUALLY failed in one auto-refresh batch (not
  // called once per batch regardless of scope, like before) - each failed
  // repo's own counter is incremented and its own circuit opened
  // independently, so one repo's flaky gh auth no longer trips every
  // other repo's breaker too.
  const recordViewPrsAutoRefreshFailure = (failedRepos = []) => {
    const repos = Array.isArray(failedRepos) ? failedRepos : [];
    repos.forEach((repo) => {
      const entry = ensureAutoCircuitEntry(repo);
      entry.consecutiveFailures += 1;
      if (entry.consecutiveFailures >= viewPrsAutoCircuitFailureThreshold) {
        const openUntilMs = Date.now() + viewPrsAutoCircuitCooldownMs;
        entry.circuitOpenUntil = new Date(openUntilMs).toISOString();
        entry.lastCircuitOpenedAt = new Date().toISOString();
        viewPrsSchedulerState.lastAutoSkipReason = `auto refresh circuit open for ${repo} until ${entry.circuitOpenUntil} after ${entry.consecutiveFailures} consecutive failure(s)`;
      }
    });
    recomputeAutoCircuitAggregates();
  };

  // Takes the repos that succeeded (not called unconditionally once per
  // clean batch) - only resets the repos that actually just succeeded,
  // leaving any OTHER repo's own existing failure count/open circuit alone.
  const resetAutoCircuitFailuresForRepos = (succeededRepos = []) => {
    const repos = Array.isArray(succeededRepos) ? succeededRepos : [];
    const byRepo = isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)
      ? viewPrsSchedulerState.autoCircuitByRepo
      : {};
    repos.forEach((repo) => {
      const entry = byRepo[repo];
      if (!entry) {
        return;
      }
      entry.consecutiveFailures = 0;
      entry.circuitOpenUntil = null;
    });
    recomputeAutoCircuitAggregates();
  };

  // The person-triggered "Reset circuit breaker" action (e.g. after a
  // laptop sleep/lock caused a burst of failures that shouldn't count once
  // it's back) - `repo` resets just that one repo's breaker; omitted
  // resets every repo's (the UI's own "reset everything" scope - see
  // REACT_MIGRATION_PLAN.md). `repos` (array) resets exactly that list -
  // used by /run-auto's own internal reset, scoped to whatever repos that
  // particular call targets, instead of blowing away every other repo's
  // breaker state just because one repo was manually retried.
  const resetAutoCircuitBreaker = ({ repo, repos } = {}) => {
    if (!isPlainObject(viewPrsSchedulerState.autoCircuitByRepo)) {
      viewPrsSchedulerState.autoCircuitByRepo = {};
    }
    // null means "reset everything" (no scope) - kept distinct from an
    // empty array, which would mean "reset nothing".
    const resetRepoList = Array.isArray(repos) ? repos : repo ? [repo] : null;
    if (resetRepoList) {
      resetRepoList.forEach((oneRepo) => {
        delete viewPrsSchedulerState.autoCircuitByRepo[oneRepo];
      });
    } else {
      viewPrsSchedulerState.autoCircuitByRepo = {};
    }
    // Only clear lastAutoSkipReason if it's actually the circuit-open
    // message THIS reset just addressed - a skip for a DIFFERENT reason
    // (missing dependencies, manual cooldown) shouldn't be erased just
    // because someone reset an unrelated circuit, and neither should a
    // message about a DIFFERENT repo's own still-open circuit just because
    // this reset happened to be scoped to some other repo (e.g. /run-auto's
    // own internal reset runs on every call, not just when something was
    // actually open for the repo(s) it targets). An unscoped (reset-
    // everything) call has no such ambiguity - any lingering circuit
    // message is necessarily stale once every repo's breaker is cleared.
    const lastSkipReason = viewPrsSchedulerState.lastAutoSkipReason;
    const shouldClearSkipReason =
      typeof lastSkipReason === "string" &&
      lastSkipReason.includes("circuit open") &&
      (resetRepoList === null || resetRepoList.some((oneRepo) => lastSkipReason.includes(oneRepo)));
    if (shouldClearSkipReason) {
      viewPrsSchedulerState.lastAutoSkipReason = null;
    }
    recomputeAutoCircuitAggregates();
  };

  // Kept as a no-arg alias of resetAutoCircuitBreaker() (resets everything)
  // for every existing caller of this name (today: /run-auto's own
  // pre-trigger reset) - same behavior as before per-repo tracking existed.
  const resetViewPrsAutoRefreshFailureState = () => {
    resetAutoCircuitBreaker();
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
    resetAutoCircuitFailuresForRepos,
    resetAutoCircuitBreaker,
    getOpenAutoCircuitRepos,
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
