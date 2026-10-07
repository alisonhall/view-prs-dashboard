// Per-repo-aware priority dispatcher (see REACT_MIGRATION_PLAN.md's
// dispatcher plan): replaces the scheduler's three independent setIntervals
// + flat global in-progress booleans with a single registry of
// (repo, taskType) entries, each with its own due-time/priority, pulled by
// one concurrency-budget-aware tick loop. Pure logic only - no fs/gh/HTTP;
// app.js still owns actually invoking the three existing job functions.
const TASK_TYPES = ["quickCheck", "autoRefresh", "mergedDrain"];

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const buildEntryKey = (repo, taskType) => `${repo}::${taskType}`;

const createViewPrsDispatcherHelpers = ({
  console,
  now = () => Date.now(),
  parseTimestamp,
  viewPrsSchedulerState,
  getViewPrsAutoRefreshRepos,
  // () => parsed schedulerRepoConfig object from user-defaults.json, read
  // fresh (not cached) every time so a PUT takes effect without a restart.
  getSchedulerRepoConfig = () => ({}),
  defaultIntervalsByTaskType,
  defaultPriorityByTaskType = { quickCheck: 5, autoRefresh: 3, mergedDrain: 1 },
  // Rough, fixed per-task estimate of concurrent `gh` processes a task will
  // spawn - a budget, not a live measurement (see the plan's Risk #3). Only
  // used to keep the single shared ceiling from being exceeded by the
  // dispatcher's own concurrent task selection.
  ghCostByTaskType = { quickCheck: 1, autoRefresh: 4, mergedDrain: 4 },
} = {}) => {
  const ensureDispatcherState = () => {
    if (!isPlainObject(viewPrsSchedulerState.dispatcher)) {
      viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
    }
    if (!isPlainObject(viewPrsSchedulerState.dispatcher.entries)) {
      viewPrsSchedulerState.dispatcher.entries = {};
    }
    if (!Number.isFinite(viewPrsSchedulerState.dispatcher.reservedGhSlots)) {
      viewPrsSchedulerState.dispatcher.reservedGhSlots = 0;
    }
    return viewPrsSchedulerState.dispatcher;
  };

  // schedulerRepoConfig is the already-fetched result of getSchedulerRepoConfig()
  // - callers fetch it ONCE per getOrInitRegistry()/migrateLegacyPersistedState()
  // call and pass it through here, rather than this function re-reading
  // user-defaults.json itself on every (repo, taskType) pair (3x per repo,
  // every ~5s tick - a real, avoidable disk read multiplied by repo count).
  const resolveEntryConfig = (repo, taskType, schedulerRepoConfig) => {
    const repoConfig = schedulerRepoConfig?.[repo] || {};
    const intervalKey = `${taskType}IntervalMs`;
    const rawInterval = repoConfig[intervalKey];
    const rawPriority = repoConfig.priority;
    const configuredInterval = Number(rawInterval);
    const configuredPriority = Number(rawPriority);
    const intervalValid = Number.isFinite(configuredInterval) && configuredInterval > 0;
    const priorityValid = Number.isFinite(configuredPriority) && configuredPriority >= 0;

    if (rawInterval !== undefined && !intervalValid) {
      console?.warn?.(
        `[view-prs] dispatcher: ignoring invalid schedulerRepoConfig.${repo}.${intervalKey} (${JSON.stringify(rawInterval)}), using default`,
      );
    }
    if (rawPriority !== undefined && !priorityValid) {
      console?.warn?.(
        `[view-prs] dispatcher: ignoring invalid schedulerRepoConfig.${repo}.priority (${JSON.stringify(rawPriority)}), using default`,
      );
    }

    return {
      intervalMs: intervalValid ? configuredInterval : defaultIntervalsByTaskType[taskType],
      priority: priorityValid ? configuredPriority : defaultPriorityByTaskType[taskType],
    };
  };

  const recomputeEntryConfig = (repo, taskType, schedulerRepoConfig) => {
    const dispatcher = ensureDispatcherState();
    const entry = dispatcher.entries[buildEntryKey(repo, taskType)];
    if (!entry) {
      return null;
    }
    const { intervalMs, priority } = resolveEntryConfig(repo, taskType, schedulerRepoConfig);
    entry.intervalMs = intervalMs;
    entry.priority = priority;
    return entry;
  };

  // Adds any missing (repo, taskType) entries (new repos discovered since
  // the last call) and refreshes every existing entry's priority/interval
  // from the current schedulerRepoConfig - cheap, safe to call every tick.
  // Never overwrites an existing entry's run-history fields (nextDueAt,
  // lastFinishedAt, etc.) - only recomputeEntryConfig's two config fields.
  const getOrInitRegistry = () => {
    const dispatcher = ensureDispatcherState();
    const repos = getViewPrsAutoRefreshRepos();
    const repoSet = new Set(repos);
    const nowMs = now();
    // Fetched once per call, not once per (repo, taskType) pair below - see
    // resolveEntryConfig's own comment.
    const schedulerRepoConfig = getSchedulerRepoConfig();

    repos.forEach((repo) => {
      TASK_TYPES.forEach((taskType) => {
        const key = buildEntryKey(repo, taskType);
        if (!dispatcher.entries[key]) {
          const { intervalMs, priority } = resolveEntryConfig(repo, taskType, schedulerRepoConfig);
          dispatcher.entries[key] = {
            repo,
            taskType,
            priority,
            intervalMs,
            // A newly-discovered repo is immediately due, same as a
            // never-run entry after a legacy-state migration - no reason to
            // make a brand-new repo wait a full interval before its first
            // check.
            nextDueAt: new Date(nowMs).toISOString(),
            lastStartedAt: null,
            lastFinishedAt: null,
            lastOk: null,
            lastError: null,
            isRunning: false,
            runCount: 0,
            consecutiveFailureCount: 0,
          };
        } else {
          recomputeEntryConfig(repo, taskType, schedulerRepoConfig);
        }
      });
    });

    // Prune entries for repos no longer tracked - otherwise a repo dropped
    // from getViewPrsAutoRefreshRepos() (env var changed, stored data
    // pruned) would keep being scheduled, erroring, and persisted to disk
    // forever, with no removal path anywhere else. Skips an entry still
    // mid-flight (isRunning) rather than yanking it out from under its own
    // in-progress run - it's pruned on the next call once it finishes.
    Object.keys(dispatcher.entries).forEach((key) => {
      const entry = dispatcher.entries[key];
      if (!repoSet.has(entry.repo) && !entry.isRunning) {
        delete dispatcher.entries[key];
      }
    });

    return dispatcher.entries;
  };

  const getAllEntries = () => Object.values(ensureDispatcherState().entries);

  const getDueEntries = ({ nowMs = now() } = {}) =>
    getAllEntries()
      .filter((entry) => !entry.isRunning && Date.parse(entry.nextDueAt) <= nowMs)
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return Date.parse(a.nextDueAt) - Date.parse(b.nextDueAt);
      });

  const estimateGhCost = (taskType) => ghCostByTaskType[taskType] ?? 1;

  // Greedy bin-pack over due entries, highest priority first: includes a
  // candidate if its estimated gh-process cost still fits the remaining
  // budget, otherwise defers it to skippedForBudget (it stays due and will
  // be reconsidered next tick - never silently dropped).
  const pickNextBatch = ({ nowMs = now(), availableGhSlots }) => {
    const due = getDueEntries({ nowMs });
    const selected = [];
    const skippedForBudget = [];
    let remaining = Number.isFinite(availableGhSlots) ? availableGhSlots : 0;

    due.forEach((entry) => {
      const cost = estimateGhCost(entry.taskType);
      if (cost <= remaining) {
        selected.push(entry);
        remaining -= cost;
      } else {
        skippedForBudget.push(entry);
      }
    });

    return { selected, skippedForBudget };
  };

  const markEntryRunning = (entry, { nowMs = now() } = {}) => {
    entry.isRunning = true;
    entry.lastStartedAt = new Date(nowMs).toISOString();
  };

  const markEntryFinished = (entry, { nowMs = now(), ok, error = null } = {}) => {
    entry.isRunning = false;
    entry.lastFinishedAt = new Date(nowMs).toISOString();
    entry.lastOk = ok;
    entry.lastError = error || null;
    entry.runCount = (entry.runCount || 0) + 1;

    if (ok) {
      entry.consecutiveFailureCount = 0;
      entry.nextDueAt = new Date(nowMs + entry.intervalMs).toISOString();
      return entry;
    }

    entry.consecutiveFailureCount = (entry.consecutiveFailureCount || 0) + 1;
    // Per-entry backoff only - independent of (and much smaller-scale than)
    // the scheduler's own global circuit breaker, which still governs
    // runViewPrsAutoRefresh's own guard unchanged. Capped at 4x so a
    // flaky-but-not-dead repo doesn't drift arbitrarily far out.
    const backoffMultiplier = Math.min(4, 1 + entry.consecutiveFailureCount);
    entry.nextDueAt = new Date(
      nowMs + entry.intervalMs * backoffMultiplier,
    ).toISOString();
    return entry;
  };

  // The single function both existing fast-follow cases (open-PR change ->
  // autoRefresh, and the previously-missing merged/closed change ->
  // mergedDrain) call. Makes the entry immediately due; the caller is
  // responsible for also triggering an immediate dispatch tick so this has
  // no added latency versus today's direct fast-follow function call.
  const bumpEntryUrgent = (repo, taskType, { reason = null } = {}) => {
    const dispatcher = ensureDispatcherState();
    const entry = dispatcher.entries[buildEntryKey(repo, taskType)];
    if (!entry) {
      return null;
    }
    entry.nextDueAt = new Date(now()).toISOString();
    entry.lastBumpReason = reason;
    return entry;
  };

  const classifyEntryStatus = (entry, nowMs) => {
    if (entry.isRunning) {
      return "running";
    }
    return Date.parse(entry.nextDueAt) <= nowMs ? "due" : "scheduled";
  };

  // Produces the dispatcherQueue array surfaced in getViewPrsSchedulerPublicState
  // (bundled into every SSE envelope) and rendered honestly in the Activity
  // drawer - sorted in the actual order the dispatcher will process it:
  // running first, then due (priority desc), then scheduled (soonest due
  // first).
  const getDispatcherQueueSnapshot = ({ limit = 20 } = {}) => {
    const nowMs = now();
    const items = getAllEntries().map((entry) => ({
      repo: entry.repo,
      taskType: entry.taskType,
      priority: entry.priority,
      status: classifyEntryStatus(entry, nowMs),
      nextDueAt: entry.nextDueAt,
      intervalMs: entry.intervalMs,
      lastFinishedAt: entry.lastFinishedAt,
      lastOk: entry.lastOk,
    }));

    const statusRank = { running: 0, due: 1, scheduled: 2 };
    items.sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) {
        return statusRank[a.status] - statusRank[b.status];
      }
      if (a.status === "due" && a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return Date.parse(a.nextDueAt) - Date.parse(b.nextDueAt);
    });

    return items.slice(0, Math.max(0, limit));
  };

  const isAnyEntryRunning = (taskType) =>
    getAllEntries().some((entry) => entry.taskType === taskType && entry.isRunning);

  const latestFinishedAtAcrossEntries = (taskType) => {
    let latestMs = null;
    getAllEntries().forEach((entry) => {
      if (entry.taskType !== taskType || !entry.lastFinishedAt) {
        return;
      }
      const entryMs = Date.parse(entry.lastFinishedAt);
      if (Number.isFinite(entryMs) && (latestMs === null || entryMs > latestMs)) {
        latestMs = entryMs;
      }
    });
    return latestMs === null ? null : new Date(latestMs).toISOString();
  };

  // Bundles everything getViewPrsSchedulerPublicState (view-prs-scheduler-helpers.js)
  // needs from the registry in one call: the flat isXInProgress/lastXAt
  // fields it already exposes stay the same NAMES (backward compatible with
  // existing frontend/test consumers) but become derived from the registry
  // instead of read off the old flat viewPrsSchedulerState fields directly,
  // plus the new dispatcherQueue array itself.
  const getPublicStateFields = () => ({
    isAutoRunInProgress: isAnyEntryRunning("autoRefresh"),
    isQuickCheckInProgress: isAnyEntryRunning("quickCheck"),
    isMergedDrainInProgress: isAnyEntryRunning("mergedDrain"),
    lastAutoRunAt: latestFinishedAtAcrossEntries("autoRefresh"),
    lastQuickCheckAt: latestFinishedAtAcrossEntries("quickCheck"),
    lastMergedDrainAt: latestFinishedAtAcrossEntries("mergedDrain"),
    dispatcherQueue: getDispatcherQueueSnapshot({ limit: 20 }),
  });

  // Given today's flat { lastManualRunAt, lastAutoRunAt, lastQuickCheckAt,
  // lastMergedDrainAt, pendingByRepo } persisted shape (no per-repo
  // granularity), builds an initial entries map for every repo currently
  // known, seeding lastFinishedAt from the matching legacy field (the same
  // value reused across every repo, since that's all the old shape ever
  // recorded) so no run history is lost across the upgrade. A repo with no
  // legacy timestamp for a given task type is immediately due rather than
  // waiting out a full interval on first boot after migrating.
  const migrateLegacyPersistedState = (legacyShape = {}, { repos, nowMs = now() } = {}) => {
    const legacyLastAtByTaskType = {
      quickCheck: legacyShape.lastQuickCheckAt || null,
      autoRefresh: legacyShape.lastAutoRunAt || null,
      mergedDrain: legacyShape.lastMergedDrainAt || null,
    };
    // Fetched once for this one-time migration call, same reasoning as
    // getOrInitRegistry's own comment.
    const schedulerRepoConfig = getSchedulerRepoConfig();

    const entries = {};
    (Array.isArray(repos) ? repos : []).forEach((repo) => {
      TASK_TYPES.forEach((taskType) => {
        const { intervalMs, priority } = resolveEntryConfig(repo, taskType, schedulerRepoConfig);
        const legacyLastAt = legacyLastAtByTaskType[taskType];
        const legacyLastAtMs = legacyLastAt ? parseTimestamp(legacyLastAt) : null;
        const nextDueAtMs =
          legacyLastAtMs !== null && Number.isFinite(legacyLastAtMs)
            ? legacyLastAtMs + intervalMs
            : nowMs;

        entries[buildEntryKey(repo, taskType)] = {
          repo,
          taskType,
          priority,
          intervalMs,
          nextDueAt: new Date(nextDueAtMs).toISOString(),
          lastStartedAt: null,
          lastFinishedAt: legacyLastAt,
          lastOk: null,
          lastError: null,
          isRunning: false,
          runCount: 0,
          consecutiveFailureCount: 0,
        };
      });
    });

    return {
      entries,
      pendingByRepo: isPlainObject(legacyShape.pendingByRepo)
        ? legacyShape.pendingByRepo
        : {},
    };
  };

  // Non-blocking budget reservation for manual/user-triggered routes (see
  // the plan's "manual routes vs. the budget" section) - manual actions
  // never wait on this, they just make the background dispatcher's own
  // pickNextBatch see fewer availableGhSlots for the duration.
  const reserveGhSlots = (n = 1) => {
    const dispatcher = ensureDispatcherState();
    dispatcher.reservedGhSlots = Math.max(0, dispatcher.reservedGhSlots + n);
    return dispatcher.reservedGhSlots;
  };

  const releaseGhSlots = (n = 1) => {
    const dispatcher = ensureDispatcherState();
    dispatcher.reservedGhSlots = Math.max(0, dispatcher.reservedGhSlots - n);
    return dispatcher.reservedGhSlots;
  };

  const getReservedGhSlots = () => ensureDispatcherState().reservedGhSlots;

  return {
    TASK_TYPES,
    getOrInitRegistry,
    recomputeEntryConfig,
    getAllEntries,
    getDueEntries,
    pickNextBatch,
    markEntryRunning,
    markEntryFinished,
    bumpEntryUrgent,
    getDispatcherQueueSnapshot,
    isAnyEntryRunning,
    latestFinishedAtAcrossEntries,
    getPublicStateFields,
    migrateLegacyPersistedState,
    reserveGhSlots,
    releaseGhSlots,
    getReservedGhSlots,
  };
};

module.exports = {
  TASK_TYPES,
  createViewPrsDispatcherHelpers,
};
