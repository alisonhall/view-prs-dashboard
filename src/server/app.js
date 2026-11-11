const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const {
  buildPrEntryKey,
  normalizePrEntryKeys,
  findPrEntryKey,
  prNumberFromKey,
} = require("./helpers/view-prs-pr-keys");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { enforceProtectedWritePolicy } = require("./state-write-policy");
const {
  createViewPrsStateStorage,
} = require("./storage/view-prs-state-storage");
const {
  createViewPrsSchedulerHelpers,
} = require("./helpers/view-prs-scheduler-helpers");
const {
  createViewPrsDispatcherHelpers,
  TASK_TYPES: DISPATCHER_TASK_TYPES,
} = require("./helpers/view-prs-dispatcher-helpers");
const {
  createViewPrsJobEventsHelpers,
} = require("./helpers/view-prs-job-events-helpers");
const { createViewPrsProgressHelpers } = require("./helpers/view-prs-progress-helpers");
const {
  registerViewPrsEventsRoutes,
} = require("./routes/view-prs-events-routes");
const {
  createViewPrsPrDiffCache,
} = require("./helpers/view-prs-pr-diff-cache");
const {
  registerViewPrsBackfillRoutes,
} = require("./routes/view-prs-backfill-routes");
const {
  registerViewPrsDataRoutes,
} = require("./routes/view-prs-data-routes");
const {
  registerViewPrsMutationRoutes,
} = require("./routes/view-prs-mutation-routes");
const {
  registerViewPrsPrRoutes,
} = require("./routes/view-prs-pr-routes");
const { registerViewPrsSourcesRoutes } = require("./routes/view-prs-sources-routes");
const {
  isViewPrsFixtureRow,
  parseTimestamp,
  isObject,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  normalizeNotesComment,
  normalizeNotes,
  normalizeAuthorComment,
  normalizeAuthorCommentSentiment,
  normalizeViewPrsAuthorComments,
  normalizePerRepoMap,
  normalizeViewPrsUserState,
  getPrDiffCacheFilePath: buildPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  extractRawDiffText,
  inferFallbackRepoForNotesOnlyEntries: inferFallbackRepoForNotesOnlyEntriesWithDefault,
  buildNotesOnlyMergedEntry: buildNotesOnlyMergedEntryWithDefault,
  buildGitDiffOnlyMergedEntry: buildGitDiffOnlyMergedEntryWithDefault,
  buildViewPrsDataManifest,
  backupStamp,
} = require("./helpers/view-prs-data-helpers");
const {
  mergePrDetailFields,
  extractHeavyPrDetailFields,
  slimPrDetailFields,
  hasPrDetailContent,
} = require("./helpers/view-prs-pr-detail-storage");
const {
  applyLiveSummaryToEntry,
  findPrsWithChangedThreads,
  findPrsNoLongerOpen,
  createViewPrsLiveSummaryHelpers,
} = require("./helpers/view-prs-live-summary-helpers");
const {
  runMigration: runPrDetailMigration,
} = require("../script/migrate-pr-detail-sidecar-v1");
const {
  createViewPrsActorHelpers,
} = require("./helpers/view-prs-actor-helpers");
const { buildActorIndex, createViewPrsActorsStorage, isCommitAuthorIdentity } = require("./helpers/view-prs-actors-storage");
const { createAppConfig } = require("./config/app-config");
const { createFileIoHelpers } = require("./helpers/file-io-helpers");
const { createCommandExecutionHelpers, describeFailure } = require("./helpers/command-execution-helpers");
const { createSchedulerHelpers } = require("./helpers/scheduler-helpers");
const { createRequestOriginGuard, isLoopbackHostname } = require("./helpers/request-origin-guard");
const { createViewPrsSourcesStorage } = require("./storage/view-prs-sources-storage");

// Configuration and constants
// Initialize configuration from config module
const viewPrsDir = path.resolve(__dirname, "../..");
const config = createAppConfig({
  viewPrsDir,
  env: process.env,
  isTestEnv: process.env.NODE_ENV === "test",
});
// The scripts and tools it runs find their files from DATA_DIR
// (check-open-pr-updates.sh's name) or VIEW_PRS_DATA_DIR (data-dir.js): both
// the server's own data folder, so they always agree.
process.env.DATA_DIR = config.viewPrsDataDir;
process.env.VIEW_PRS_DATA_DIR = config.viewPrsDataDir;

// Extract commonly used config values for compatibility
const {
  defaultViewPrsRepo,
  viewPrsUiDir,
  viewPrsUiIndexFile,
  viewPrsUiBuildDir,
  viewPrsUiBuildIndexFile,
  viewPrsDataFile,
  viewPrsLiveSummaryFile,
  viewPrsSourcesFile,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  viewPrsSchedulerFile,
  viewPrsLegacySchedulerFile,
  viewPrsPrDetailDir,
  viewPrsBackupDir,
  viewPrsPrDiffDir,
  viewPrsRunScriptRelativePath,
  viewPrsBackfillManagerRelativePath,
  viewPrsBackfillManagerScript,
  viewPrsBackfillPidFile,
  viewPrsBackfillLogFile,
  viewPrsUserDefaultsFile,
  viewPrsActorNameCacheFile,
  viewPrsActorLoginAliasesFile,
  viewPrsActorsFile,
  viewPrsDataDir,
  viewPrsActionLogFile,
  viewPrsAutoIntervalMs,
  viewPrsManualCooldownMs,
  viewPrsQuickCheckIntervalMs,
  viewPrsMergedFullSweepIntervalMs,
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAutoScriptTimeoutMs,
  viewPrsManualScriptTimeoutMs,
  viewPrsQuickCheckScriptTimeoutMs,
  viewPrsQuickCheckAllScriptTimeoutMs,
  viewPrsQuickCheckAllJobs,
  viewPrsAckScriptTimeoutMs,
  viewPrsAckRefreshScriptTimeoutMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsBackfillStatusTimeoutMs,
  viewPrsBackfillActionTimeoutMs,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
  viewPrsDispatcherGhProcessBudget,
  viewPrsDispatcherTickIntervalMs,
  viewPrsViewerLoginCacheTtlMs,
  viewPrsInsightsHookTimeoutMs,
  viewPrsBackupRetention,
  viewPrsEventsHeartbeatIntervalMs,
  viewPrsEventsMaxClients,
  viewPrsEventsDataWatchIntervalMs,
  viewPrsSchedulerStateThrottleMs,
} = config;

// Note: getViewPrsAutoRepoConcurrency is now a constant, not a function
// For compatibility, wrap it
const getViewPrsAutoRepoConcurrency = () => config.viewPrsPrDiffConcurrency;

let cachedViewPrsViewerLogin = "";
let cachedViewPrsViewerLoginAt = 0;

const viewPrsSchedulerState = {
  startedAt: new Date().toISOString(),
  lastManualRunAt: null,
  lastAutoAttemptAt: null,
  lastAutoRunAt: null,
  lastAutoSkipReason: null,
  lastAutoError: null,
  isAutoRunInProgress: false,
  // The specific repos the current in-flight auto refresh targets (empty
  // when none is running) - additive alongside isAutoRunInProgress, which
  // stays a plain boolean for backward compat. Lets runViewPrsQuickCheck
  // defer only the repos that actually overlap with a running refresh,
  // instead of blocking on auto refresh globally regardless of which repos
  // either call actually targets (see runViewPrsQuickCheck's own guard).
  autoRefreshInProgressRepos: new Set(),
  activePrNumbers: [],
  // The PRs a run of chosen PRs hasn't reached yet (the rows' "queued").
  queuedPrNumbers: [],
  // Back-compat aggregates derived from autoCircuitByRepo below (worst
  // case across every repo) - kept for existing consumers
  // (getViewPrsSchedulerPublicState, pr-applied-summary.helpers.ts's "Last
  // auto skip" text). Not written to directly - see
  // recomputeAutoCircuitAggregates in view-prs-scheduler-helpers.js.
  consecutiveAutoFailures: 0,
  autoCircuitOpenUntil: null,
  lastAutoCircuitOpenedAt: null,
  // Per-repo circuit breaker - { [repo]: { consecutiveFailures,
  // circuitOpenUntil, lastCircuitOpenedAt } }. Deliberately separate from
  // the dispatcher's own per-(repo,taskType) consecutiveFailureCount/backoff
  // (view-prs-dispatcher-helpers.js) - see
  // view-prs-scheduler-helpers.js's own comment on this mechanism for why.
  autoCircuitByRepo: {},
  isQuickCheckInProgress: false,
  // The specific repos the current in-flight quick check call(s) actually
  // target (empty when none running) - additive alongside
  // isQuickCheckInProgress, which stays a plain boolean (true whenever this
  // Set is non-empty) for backward compat. Lets a quick check for repo B
  // proceed while a DIFFERENT quick check call is still running for repo A,
  // instead of blocking on quick check globally regardless of repo overlap
  // (see runViewPrsQuickCheck's own guard) - same reasoning as
  // autoRefreshInProgressRepos above, just for quick-check-vs-itself instead
  // of quick-check-vs-auto-refresh.
  quickCheckInProgressRepos: new Set(),
  lastQuickCheckAt: null,
  lastQuickCheckAttemptAt: null,
  lastQuickCheckSkipReason: null,
  lastQuickCheckError: null,
  // True whenever quickCheckSkippedRepos (below) is non-empty - kept as a
  // plain boolean (rather than removed) since it's part of the public
  // scheduler state surfaced to the UI (see getViewPrsSchedulerPublicState/
  // pr-job-events.helpers.ts's "waitingOn" display) - consumed by
  // runViewPrsAutoRefresh's finally block to fire an immediate catch-up
  // quick check as soon as the blocking refresh finishes, instead of
  // leaving detection of anything that changed in the meantime (e.g. a
  // brand-new PR) to wait for the next periodic quick-check tick, which for
  // a slow multi-repo sweep could be a much longer wait than the quick
  // check's ~5 minute interval would suggest.
  quickCheckSkippedWhileAutoRunInProgress: false,
  // The specific repos skipped for the reason above - additive alongside
  // the boolean flag, which stays unchanged for every existing reader. Lets
  // the catch-up fast-follow re-check only the repos that were actually
  // starved, instead of blindly re-checking every configured repo.
  quickCheckSkippedRepos: new Set(),
  lastMergedDrainAt: null,
  isMergedDrainInProgress: false,
  pendingByRepo: {},
  // PRs fetched on their own that their last run couldn't fetch:
  // "repo#number" => since when (recordUnreachablePrs).
  unreachablePrSince: {},
  // Each repo's last refresh that failed, until one works
  // (recordRefreshOutcome): { at, since, error, prNumbers }.
  refreshFailureByRepo: {},
  // Open rows the quick check queued as no longer open: "repo#number" =>
  // when (takeNoLongerOpenToQueue).
  noLongerOpenQueuedAt: {},
  // { [repo | "*"]: iso } - each repo's last manual full refresh, which its
  // auto refresh waits out (see setLastManualRunNow).
  manualFullRunAtByRepo: {},
};

const viewPrsActivePrCounts = new Map();
// The same, for the PRs runs of chosen PRs are still to fetch.
const viewPrsQueuedPrCounts = new Map();

// Initialize scheduler helpers (uses only fs, path, config - no circular deps)
const schedulerHelpers = createSchedulerHelpers({
  fs,
  path,
  viewPrsActionLogFile: config.viewPrsActionLogFile,
});

// Extract scheduler helper functions
const {
  appendActionLogEntry: _appendActionLogEntry,
  readActionLog: _readActionLog,
} = schedulerHelpers;

// Initialize file I/O helpers (uses only fs, path - no circular deps)
const fileIoHelpers = createFileIoHelpers({ fs, path });

// Extract file I/O helper functions
const {
  readJsonFileIfExists: _readJsonFileIfExists,
  readJsonFileIfExistsDetailed: _readJsonFileIfExistsDetailed,
  safeReadJsonFile: _safeReadJsonFile,
  writeJsonFile: _writeJsonFile,
  writeJsonFileBestEffort: _writeJsonFileBestEffort,
} = fileIoHelpers;

// viewPrsActivePrCounts is keyed by "repo::prNumber", not prNumber alone -
// PR numbers are only unique within a repo, and the auto-refresh fan-out
// (getViewPrsAutoRefreshRepos/runRepoRefresh) tracks several repos'
// in-progress PRs at once, so a bare-number key would let PR #5 in one repo
// show as "active" for PR #5 in a completely different repo on the client.
const ACTIVE_PR_KEY_SEPARATOR = "::";

const buildActivePrKey = (prNumber, repo) =>
  `${String(repo || "").trim()}${ACTIVE_PR_KEY_SEPARATOR}${prNumber}`;

const parseActivePrKey = (key) => {
  const separatorIndex = key.indexOf(ACTIVE_PR_KEY_SEPARATOR);
  return {
    repo: separatorIndex === -1 ? "" : key.slice(0, separatorIndex),
    prNumber:
      separatorIndex === -1
        ? key
        : key.slice(separatorIndex + ACTIVE_PR_KEY_SEPARATOR.length),
  };
};

const toSortedActivePrPairs = (counts) =>
  [...counts.keys()].map(parseActivePrKey).sort((left, right) => {
    if (left.repo !== right.repo) {
      return left.repo < right.repo ? -1 : 1;
    }
    return Number(left.prNumber) - Number(right.prNumber);
  });

const syncSchedulerActivePrNumbers = () => {
  viewPrsSchedulerState.activePrNumbers = toSortedActivePrPairs(viewPrsActivePrCounts);
  viewPrsSchedulerState.queuedPrNumbers = toSortedActivePrPairs(viewPrsQueuedPrCounts);
  // Pushes the same per-PR progress signal the 30s scheduler poll used to
  // surface, just live - see the "Polling retirement" section of the
  // activity-drawer plan for why this isn't tied to a specific job's
  // start/finish lifecycle (manual single-PR refreshes drive it too).
  callEmitSchedulerStateChanged();
};

const incrementActivePrNumber = (prNumber, repo) => {
  const safePrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(safePrNumber)) {
    return;
  }

  const key = buildActivePrKey(safePrNumber, repo);
  const currentCount = viewPrsActivePrCounts.get(key) || 0;
  viewPrsActivePrCounts.set(key, currentCount + 1);
  syncSchedulerActivePrNumbers();
};

const decrementActivePrNumber = (prNumber, repo) => {
  const safePrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(safePrNumber)) {
    return;
  }

  const key = buildActivePrKey(safePrNumber, repo);
  const currentCount = viewPrsActivePrCounts.get(key) || 0;
  if (currentCount <= 1) {
    viewPrsActivePrCounts.delete(key);
  } else {
    viewPrsActivePrCounts.set(key, currentCount - 1);
  }
  syncSchedulerActivePrNumbers();
};

const viewPrsProgressTracker = {
  onStart: (prNumber, repo) => {
    incrementActivePrNumber(prNumber, repo);
  },
  onEnd: (prNumber, repo) => {
    decrementActivePrNumber(prNumber, repo);
  },
  onRunDone: (runProgressCounts, repo) => {
    if (!(runProgressCounts instanceof Map)) {
      return;
    }

    runProgressCounts.forEach((count, prNumber) => {
      for (let index = 0; index < count; index += 1) {
        decrementActivePrNumber(prNumber, repo);
      }
    });
  },
};

// Queued: PRs a run of chosen PRs will fetch, until it starts each one
// (then it's active, from its own progress marker) or the run ends.
// Counted, as two runs may queue the same PR.
const changeQueuedPrNumbers = (prNumbers, repo, delta) => {
  const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers.map((prNumber) => String(prNumber || "").trim()))] : [];
  let changed = false;
  uniqueNumbers
    .filter((prNumber) => /^\d+$/.test(prNumber))
    .forEach((prNumber) => {
      const key = buildActivePrKey(prNumber, repo);
      const count = (viewPrsQueuedPrCounts.get(key) || 0) + delta;
      if (count > 0) viewPrsQueuedPrCounts.set(key, count);
      else viewPrsQueuedPrCounts.delete(key);
      changed = true;
    });
  if (changed) syncSchedulerActivePrNumbers();
};
const addSchedulerQueuedPrNumbers = (prNumbers, repo) => changeQueuedPrNumbers(prNumbers, repo, 1);
const removeSchedulerQueuedPrNumbers = (prNumbers, repo) => changeQueuedPrNumbers(prNumbers, repo, -1);

// Initialize command execution helpers
const commandHelpers = createCommandExecutionHelpers({
  spawn,
  spawnSync,
  process,
  viewPrsDir: config.viewPrsDir,
  viewPrsScriptsDir: path.join(config.viewPrsDir, 'scripts'),
  requiredCommands: config.requiredCommands,
  requiredPackages: config.requiredPackages,
  viewPrsProgressTracker,
});

// Extract command helper functions
const {
  runViewPrsCommand: _runViewPrsCommand,
  runViewPrsBashCommand: _runViewPrsBashCommand,
  runViewPrsScript: _runViewPrsScript,
  runViewPrsShellScript: _runViewPrsShellScript,
  formatScriptFailureMessage: _formatScriptFailureMessage,
  isCommandAvailable: _isCommandAvailable,
  getDependencyStatus: _getDependencyStatus,
  isGhAuthenticated: _isGhAuthenticated,
} = commandHelpers;

// Use scheduler helpers for action log management
const appendActionLogEntry = (entry) => _appendActionLogEntry(entry);
const readActionLog = () => _readActionLog();

// Use file I/O helpers for JSON file operations
const readJsonFileIfExists = (filePath, fallbackValue) => 
  _readJsonFileIfExists(filePath, fallbackValue);

const readJsonFileIfExistsDetailed = (filePath) => 
  _readJsonFileIfExistsDetailed(filePath);

const readUserDefaults = () => 
  _safeReadJsonFile(config.viewPrsUserDefaultsFile, {});

const writeUserDefaults = (overrides) => {
  const data = isObject(overrides) ? overrides : {};
  _writeJsonFile(config.viewPrsUserDefaultsFile, data);
};

const safeReadJsonFile = (filePath, fallbackValue = null) => 
  _safeReadJsonFile(filePath, fallbackValue);

// Use command execution helper
const runViewPrsCommand = (command, args, maxBufferBytes, options) =>
  _runViewPrsCommand(command, args, maxBufferBytes, options);

// Same override-checking pattern as callRunViewPrsScript/callRunViewPrsBashCommand
// further below - lets tests monkeypatch module.exports.runViewPrsCommand before
// createViewPrsApp() so fetchPrDiffText (view-prs-pr-diff-cache.js, used by GET
// /diff and the background diff-refresh queue) can be tested without a real
// `gh api ...` spawn. Declared here (rather than alongside the other callRunViewPrsX
// wrappers) because createViewPrsPrDiffCache is wired up immediately below and
// needs the override-aware version passed in, not the raw function.
const callRunViewPrsCommand = (...args) =>
  (module.exports.runViewPrsCommand || runViewPrsCommand)(...args);

const {
  getPrDiffCacheFilePath,
  readPrDiffCache,
  syncPrDiffForEntry,
  enqueuePrDiffRefresh,
  enqueuePrDiffRefreshForData,
} = createViewPrsPrDiffCache({
  fs,
  safeReadJsonFile,
  toTrimmedString,
  isRepoSlug,
  getPrDiffCommitFingerprint,
  extractRawDiffText,
  buildPrDiffCacheFilePath,
  runViewPrsCommand: callRunViewPrsCommand,
  // Lazily: the sources' helpers are made further down.
  getRepoGhEnv: (repo) => getRepoGhEnv(repo),
  viewPrsPrDiffDir,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
});

// Open PRs' live summary, listed with each quick check and laid over the
// rows in readViewPrsData (see view-prs-live-summary-helpers.js).
const {
  readLiveSummary,
  refreshRepoLiveSummary,
  getLiveSummaryVersion,
  getLiveSummaryMeta,
} = createViewPrsLiveSummaryHelpers({
  fs,
  liveSummaryFile: viewPrsLiveSummaryFile,
  runViewPrsCommand: callRunViewPrsCommand,
  getRepoGhEnv: (repo) => getRepoGhEnv(repo),
});
// Overridable like callRunViewPrsCommand, so tests can stand in for it.
const callRefreshRepoLiveSummary = (...args) =>
  (module.exports.refreshRepoLiveSummary || refreshRepoLiveSummary)(...args);
const isLiveSummaryDisabled = () =>
  /^(1|true|yes)$/i.test(String(process.env.VIEW_PRS_DISABLE_LIVE_SUMMARY || "").trim());

// Custom "More Insights" hook - an optional, user-provided executable
// (VIEW_PRS_INSIGHTS_HOOK_SCRIPT, unset by default) that receives PR metadata
// and returns HTML to render in a section of the row's "More Insights" panel.
// Deliberately not shipped with the repo - what a repo/org wants surfaced here
// is inherently custom, and the script is invoked directly (not resolved
// against any repo-relative directory), so it can live anywhere on disk.
//
// Kept well under argv/command-line limits (Windows' CreateProcess caps a
// full command line around 32K chars; the description is the one field here
// with no natural size bound, so it's the one worth capping defensively) -
// a hook script only needs enough of the description to summarize it, not
// the whole thing verbatim.
const MAX_INSIGHTS_HOOK_DESCRIPTION_LENGTH = 4000;

const buildInsightsHookMetadata = (entry) => {
  const data = entry?.data || {};
  const repo = toTrimmedString(entry?.repo);
  const [repoOwner, repoName] = repo.split("/");
  const commits = Array.isArray(data.commits) ? data.commits : [];
  const lastCommit = commits.length > 0 ? commits[commits.length - 1] : null;
  // section is populated with "merged"/"closed" by upsert_pr_state calls in
  // check-open-pr-updates.sh - data.mergedAt is checked first since it's the
  // more authoritative signal, but section is still consulted as a fallback
  // for a "merged" section whose mergedAt somehow wasn't captured (a legacy
  // row or migration gap), not just to distinguish "closed" from "open".
  const status = data.mergedAt
    ? "merged"
    : entry?.section === "draft"
      ? "draft"
      : entry?.section === "closed"
        ? "closed"
        : entry?.section === "merged"
          ? "merged"
          : "open";

  return {
    repoOwner: repoOwner || "",
    repoName: repoName || "",
    repo,
    prId: String(entry?.prNumber || data.number || "").trim(),
    prUrl: String(data.url || ""),
    sourceBranch: String(data.sourceBranch || ""),
    targetBranch: String(data.targetBranch || ""),
    title: String(data.title || ""),
    description: String(data.description || "").slice(
      0,
      MAX_INSIGHTS_HOOK_DESCRIPTION_LENGTH,
    ),
    status,
    author: String(data.authorLogin || data.author || ""),
    lastCommitDate: String(lastCommit?.committedAt || ""),
    lastCommitId: String(lastCommit?.oid || ""),
  };
};

// Best-effort by design: an unset script, a timeout, a non-zero exit, or any
// other spawn failure all resolve to a null html so the client can simply
// omit the hook section rather than surfacing an internal error for what is,
// from the end user's perspective, an optional feature. The `error` field is
// separate from that - it's non-null only when a *configured* hook actually
// failed (never for the common, expected "not configured" case), and exists
// purely so the client can log it to the browser console for debugging; nothing
// reads it to decide whether to render.
//
// Invoked via `bash -c 'exec "$0" "$@"' <scriptPath> <jsonArg>` rather than
// spawning scriptPath directly - matching every other script invocation in
// this file (runViewPrsBashCommand/runViewPrsScript/runViewPrsShellScript all
// spawn "bash" explicitly, never the script path as the executable itself).
// Spawning scriptPath directly relies on the OS recognizing and dispatching
// its shebang line, which native Windows' CreateProcess does not do - it
// would silently fail to launch any non-Windows-native (.sh/.py/etc.) hook
// script on Windows even though the whole app already requires bash (Git
// Bash) to run at all. Routing through `bash -c 'exec "$0" "$@"'` uses
// bash's own exec (which Git Bash's MSYS layer emulates, shebang and all) to
// launch the target file as its own process, while still passing scriptPath
// and the JSON argument as literal argv entries (via $0/$@, not string
// interpolation) so neither needs shell-escaping.
const runInsightsHookScript = async (entry) => {
  if (!config.viewPrsInsightsHookScript) {
    return { html: null, error: null };
  }

  const metadata = buildInsightsHookMetadata(entry);

  try {
    const { stdout } = await callRunViewPrsBashCommand(
      [
        "-c",
        'exec "$0" "$@"',
        config.viewPrsInsightsHookScript,
        JSON.stringify(metadata),
      ],
      1024 * 1024,
      { timeoutMs: viewPrsInsightsHookTimeoutMs },
    );
    return {
      html: typeof stdout === "string" && stdout.trim() ? stdout : null,
      error: null,
    };
  } catch (failure) {
    const baseMessage = formatScriptFailureMessage(
      failure,
      "Insights hook script failed",
    );
    const stderrExcerpt = String(failure?.stderr || "").trim().slice(0, 500);
    const message = stderrExcerpt
      ? `${baseMessage}: ${stderrExcerpt}`
      : baseMessage;
    console.error(
      `[view-prs] insights hook script failed for ${entry?.repo}#${entry?.prNumber}: ${message}`,
    );
    return { html: null, error: message };
  }
};

// Same override-checking pattern as callRunViewPrsScript/callRunViewPrsShellScript
// above - lets tests monkeypatch module.exports.runInsightsHookScript before
// createViewPrsApp() so the GET /insights-hook route can be tested without
// actually shelling out to a script.
const callRunInsightsHookScript = (...args) =>
  (module.exports.runInsightsHookScript || runInsightsHookScript)(...args);

const initUserDefaultsFile = () => {
  if (!fs.existsSync(viewPrsUserDefaultsFile)) {
    writeUserDefaults({});
  }
};

const inferFallbackRepoForNotesOnlyEntries = (byPrNumberRaw = {}, lastRun) =>
  inferFallbackRepoForNotesOnlyEntriesWithDefault(
    byPrNumberRaw,
    lastRun,
    defaultViewPrsRepo,
  );

const buildNotesOnlyMergedEntry = (prNumber, notes, repo) =>
  buildNotesOnlyMergedEntryWithDefault(
    defaultViewPrsRepo,
    prNumber,
    notes,
    repo,
  );

const buildGitDiffOnlyMergedEntry = (prNumber, repo, fetchedAt = "") =>
  buildGitDiffOnlyMergedEntryWithDefault(
    defaultViewPrsRepo,
    prNumber,
    repo,
    fetchedAt,
  );

const collectMissingPrsFromDiffCache = (existingByPrNumber = {}, fallbackRepo = "") => {
  if (!fs.existsSync(viewPrsPrDiffDir)) {
    return [];
  }

  let fileNames;
  try {
    fileNames = fs.readdirSync(viewPrsPrDiffDir);
  } catch (_error) {
    return [];
  }

  // By repo and number: another repo's PR with the same number is another PR.
  const existingKeys = new Set(
    Object.entries(existingByPrNumber || {}).map(([key, entry]) =>
      buildPrEntryKey(entry?.repo || fallbackRepo, entry?.prNumber || prNumberFromKey(key)),
    ),
  );
  const collected = [];

  fileNames
    .filter((name) => String(name || "").toLowerCase().endsWith(".json"))
    .forEach((fileName) => {
      const absolutePath = path.join(viewPrsPrDiffDir, fileName);
      const parsed = safeReadJsonFile(absolutePath, null);
      if (!isObject(parsed)) {
        return;
      }

      const prNumberFromPayload = String(parsed.prNumber || "").trim();
      const prNumberFromName = String(fileName || "").match(/__pr-(\d+)\.json$/i)?.[1] || "";
      const prNumber = prNumberFromPayload || prNumberFromName;
      const repo = isRepoSlug(parsed.repo) ? parsed.repo : fallbackRepo;
      const key = buildPrEntryKey(repo, prNumber);
      if (!/^\d+$/.test(prNumber) || existingKeys.has(key)) {
        return;
      }

      collected.push({
        key,
        prNumber,
        repo,
        fetchedAt: toTrimmedString(parsed.fetchedAt),
      });
      existingKeys.add(key);
    });

  return collected;
};

const isPathInside = (candidatePath, rootPath) => {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(rootPath);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const resolveViewPrsDetailFilePath = (detailRef) => {
  if (!isObject(detailRef)) {
    return "";
  }

  const rawFilePath = toTrimmedString(detailRef.file);
  if (!rawFilePath) {
    return "";
  }

  if (path.isAbsolute(rawFilePath)) {
    const absolutePath = path.resolve(rawFilePath);
    if (!isPathInside(absolutePath, viewPrsPrDetailDir)) {
      return "";
    }
    return absolutePath;
  }

  const resolvedPath = path.resolve(viewPrsDir, rawFilePath);
  if (!isPathInside(resolvedPath, viewPrsDir)) {
    return "";
  }
  return resolvedPath;
};

const readViewPrsDetailPayload = (detailRef) => {
  const detailFilePath = resolveViewPrsDetailFilePath(detailRef);
  if (!detailFilePath || !fs.existsSync(detailFilePath)) {
    return null;
  }

  const parsed = readJsonFileIfExists(detailFilePath, null);
  return isObject(parsed) ? parsed : null;
};

const hashDetailText = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);

// A row with its detail fields from its detail file (or inline, in data
// from before the files), and the detail's version: a hash of the file's
// text, so a change to the text alone - an edited comment - moves the
// row's version too, though the list's rows carry no text
// (slimViewPrsEntry). Empty when the row has no detail.
const loadViewPrsEntryDetail = (entry) => {
  if (!isObject(entry) || !isObject(entry.data)) {
    return { entry, detailVersion: "" };
  }

  const detailFilePath = resolveViewPrsDetailFilePath(entry.data.detailRef);
  let detailText = "";
  let detailPayload = null;
  if (detailFilePath && fs.existsSync(detailFilePath)) {
    try {
      detailText = fs.readFileSync(detailFilePath, "utf8");
      const parsed = JSON.parse(detailText);
      detailPayload = isObject(parsed) ? parsed : null;
    } catch (_error) {
      detailPayload = null;
    }
  }

  if (detailPayload) {
    return {
      entry: { ...entry, data: mergePrDetailFields(entry.data, detailPayload) },
      detailVersion: hashDetailText(detailText),
    };
  }
  return {
    entry,
    detailVersion: hasPrDetailContent(entry.data)
      ? hashDetailText(JSON.stringify(extractHeavyPrDetailFields(entry.data)))
      : "",
  };
};

const hydrateViewPrsEntryWithDetail = (entry) => loadViewPrsEntryDetail(entry).entry;

// A row as the list sends it: its detail fields without their text
// (slimPrDetailFields), marked so the page fetches the rest
// (/view-prs/pr-detail) where it shows one PR in full. The full rows were
// ~100 MB for 960 PRs, most of it text the table never shows.
const slimViewPrsEntry = (entry, detailVersion) => {
  if (!detailVersion || !isObject(entry) || !isObject(entry.data)) {
    return entry;
  }
  return {
    ...entry,
    data: { ...slimPrDetailFields(entry.data), detailSlim: true, detailVersion },
  };
};

const {
  writeJsonFileWithBackup,
  writeViewPrsUserState,
  updateViewPrsUserState,
  writeViewPrsAuthorComments,
  mergeMissingPerRepoMap,
  migrateLegacyViewPrsUserState,
} = createViewPrsStateStorage({
  fs,
  enforceProtectedWritePolicy,
  viewPrsBackupRetention,
  viewPrsBackupDir,
  viewPrsDataFile,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  readJsonFileIfExists,
  readJsonFileIfExistsDetailed,
  normalizeViewPrsUserState,
  normalizeViewPrsAuthorComments,
  normalizeNotes,
  normalizePerRepoMap,
  isObject,
  backupStamp,
});

const readViewPrsAuthorComments = () =>
  normalizeViewPrsAuthorComments(
    readJsonFileIfExists(viewPrsAuthorCommentsFile, {}),
  );

const {
  normalizeDisplayName,
} = createViewPrsActorHelpers({
  toTrimmedString,
});

const writeJsonFileBestEffort = (filePath, value) => _writeJsonFileBestEffort(filePath, value);


// The people (data/actors.json, view-prs-actors-storage.js): one record
// each, with their name and every login that's them.
const actorsStorage = createViewPrsActorsStorage({
  fs,
  readJsonFileIfExists,
  actorsFile: viewPrsActorsFile,
  legacyNameCacheFile: viewPrsActorNameCacheFile,
  legacyAliasesFile: viewPrsActorLoginAliasesFile,
});

// A login's person's id (ignoring case), an id as it is, else the value:
// the key a person's things are kept under (the Authors view's comments).
const resolveViewPrsActorKey = (value) => {
  const { actors, movedIds } = actorsStorage.readState();
  return buildActorIndex(actors, movedIds).keyOf(value);
};

const resolveActorNameFromGitHub = (login) => {
  const normalizedLogin = toTrimmedString(login);
  if (!normalizedLogin || normalizedLogin === "unknown") {
    return "";
  }
  if (normalizedLogin === "copilot-pull-request-reviewer") {
    return "Copilot";
  }

  const result = spawnSync(
    "gh",
    ["api", `users/${normalizedLogin}`, "--jq", '.name // ""'],
    {
      encoding: "utf8",
      timeout: 15000,
    },
  );

  if (result.status !== 0) {
    return "";
  }

  const resolved = normalizeDisplayName(result.stdout);
  if (!resolved || resolved === normalizedLogin) {
    return "";
  }

  return resolved;
};

// The people, for the page - `actors`, and `actorsMap` (each id's name,
// buildActorIndex) - adding a person for each login in the data no one has
// yet: named as the data names them, else as GitHub does (gh api
// users/<login>), else not named. A person already there is never changed
// (their name may have been set in Settings) but to take a commit author
// named exactly as they are (addObservedLogins). While the people file is
// unreadable, no one is added (nor asked of GitHub, which every read
// would do again).
const buildViewPrsActorMaps = (byPrNumberRaw = {}) => {
  const { actors: knownActors, movedIds, unreadable } = actorsStorage.readState();
  const known = new Set(knownActors.flatMap((actor) => actor.logins.map((login) => login.toLowerCase())));
  const dataNameByLogin = new Map();
  const addActorNameOrTrack = (login, name) => {
    const normalizedLogin = toTrimmedString(login);
    if (!normalizedLogin || normalizedLogin === "unknown") {
      return;
    }
    if (unreadable || known.has(normalizedLogin.toLowerCase())) {
      return;
    }
    // The first real name the data gives (not just the login again).
    if (dataNameByLogin.get(normalizedLogin)) return;
    const normalizedName = normalizeDisplayName(name);
    dataNameByLogin.set(normalizedLogin, normalizedName && normalizedName !== normalizedLogin ? normalizedName : "");
  };

  Object.values(byPrNumberRaw).forEach((entry) => {
    const row = entry?.data || {};
    addActorNameOrTrack(row.authorLogin, row.author);

    (Array.isArray(row.approvers) ? row.approvers : []).forEach((approver) => {
      addActorNameOrTrack(approver?.login, approver?.name);
    });

    (Array.isArray(row.comments) ? row.comments : []).forEach((comment) => {
      addActorNameOrTrack(
        comment?.authorLogin,
        comment?.authorName || comment?.author?.name,
      );
    });

    (Array.isArray(row.reviews) ? row.reviews : []).forEach((review) => {
      addActorNameOrTrack(
        review?.authorLogin,
        review?.authorName || review?.author?.name,
      );
    });

    (Array.isArray(row.reviewThreads) ? row.reviewThreads : []).forEach(
      (thread) => {
        (Array.isArray(thread?.comments) ? thread.comments : []).forEach(
          (comment) => {
            addActorNameOrTrack(
              comment?.authorLogin,
              comment?.authorName || comment?.author?.name,
            );
          },
        );
      },
    );

    (Array.isArray(row.commits) ? row.commits : []).forEach((commit) => {
      (Array.isArray(commit?.authors) ? commit.authors : []).forEach(
        (author) => {
          addActorNameOrTrack(author?.login, author?.name);
        },
      );
    });

    (Array.isArray(row.activityTimeline) ? row.activityTimeline : []).forEach(
      (bucket) => {
        addActorNameOrTrack(
          bucket?.actor,
          bucket?.author?.name || bucket?.author,
        );
        (Array.isArray(bucket?.events) ? bucket.events : []).forEach(
          (event) => {
            addActorNameOrTrack(
              event?.actor,
              event?.author?.name || event?.author || event?.actorName,
            );
          },
        );
      },
    );
  });

  // Not asked of GitHub for a commit author's name or email: no account has
  // it, so the lookup (a gh call, up to 15s, holding up the read) only fails.
  const added = Array.from(dataNameByLogin, ([login, name]) => ({
    login,
    name: name || (isCommitAuthorIdentity(login) ? "" : resolveActorNameFromGitHub(login)),
  }));
  // Every time, not only with someone new: it also joins a commit author
  // added before to the person of that name (it writes only on a change).
  const actors = unreadable ? knownActors : actorsStorage.addObservedLogins(added);
  return { actors, actorIdMoves: movedIds, actorsMap: buildActorIndex(actors, movedIds).actorsMap };
};

// Each person's name, by id, for the page (buildViewPrsActorMaps).
const buildViewPrsActorsMap = (byPrNumberRaw = {}) => buildViewPrsActorMaps(byPrNumberRaw).actorsMap;

const readViewPrsDataRef = (...args) => readViewPrsData(...args);
const callReadViewPrsData = (...args) =>
  (module.exports.readViewPrsData || readViewPrsDataRef)(...args);

// Breaks a circular construction order: createViewPrsDispatcherHelpers (below)
// needs getViewPrsAutoRefreshRepos FROM createViewPrsSchedulerHelpers, but
// createViewPrsSchedulerHelpers's own getViewPrsSchedulerPublicState needs
// the dispatcher's getPublicStateFields - a plain mutable box, assigned
// once dispatcherHelpers actually exists a few lines down, read lazily (by
// closure, not by value) so the order of construction doesn't matter by
// the time either function is actually CALLED (always well after both
// factories have run, since this is all synchronous module-load-time code).
let dispatcherHelpersRef = null;

// Which repos and PRs are in view (view-prs-sources-storage.js).
const viewPrsSourcesStorage = createViewPrsSourcesStorage({
  fs,
  sourcesFile: viewPrsSourcesFile,
  isRepoSlug,
  console,
});


// What's running and how far it's got (each change pushes a scheduler
// frame, throttled), for the Activity popover's Now.
const {
  startTask: startProgressTask,
  getProgressTasks,
  countFinishedPrs,
} = createViewPrsProgressHelpers({ onChange: () => callEmitSchedulerStateChanged() });

const {
  getManualCooldownSkipReason,
  readViewPrsSchedulerState,
  persistViewPrsSchedulerState,
  setLastManualRunNow,
  getManualFullRunAtForRepo,
  getViewPrsSchedulerPublicState,
  getViewPrsAutoCircuitOpenState,
  buildAckRefreshBudgetSkipErrors,
  recordViewPrsAutoRefreshFailure,
  resetViewPrsAutoRefreshFailureState,
  resetAutoCircuitFailuresForRepos,
  resetAutoCircuitBreaker,
  getOpenAutoCircuitRepos,
  getViewPrsAutoRefreshRepos,
  getExplicitRefreshNumbers,
  getExplicitPrNumbersInWindow,
  getRowVisibility,
  getRepoGhEnv,
  inferTrackedRepos,
  subscribeRepoToRecent,
  seedSubscriptionRepos,
  setPendingForRepo,
  clearPendingForRepo,
  clearPendingNumbersForRepo,
  getPendingForRepo,
  getReposWithPendingOpen,
  getReposWithPendingMergedClosed,
  getPendingUpdatePrNumberKeys,
} = createViewPrsSchedulerHelpers({
  getProgressTasks: () => getProgressTasks(),
  fs,
  console,
  parseTimestamp,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  sourcesStorage: viewPrsSourcesStorage,
  // Lazily: defined further down.
  getDataVersion: () => readViewPrsDataVersion(),
  getDispatcherDerivedFields: () => dispatcherHelpersRef?.getPublicStateFields() || {},
  // callReadViewPrsData, not readViewPrsDataRef: getViewPrsAutoRefreshRepos
  // below (the only consumer) reads via this as a lazy default parameter
  // (`data = readViewPrsData()`) - using the plain ref bypassed the
  // `module.exports.readViewPrsData ||` override every other data-reading
  // call site in this file already goes through, so a test's
  // `appModule.readViewPrsData = mockFn` silently had no effect on which
  // repos an auto-refresh run actually picked (confirmed: it fell through
  // to the real on-disk/env-var-fallback repo instead of the mock's data,
  // even though downstream calls like getLatestMergedPrNumbersForRepo -
  // which does use callReadViewPrsData - correctly saw the mock).
  readViewPrsData: callReadViewPrsData,
  defaultViewPrsRepo,
  viewPrsAutoIntervalMs,
  viewPrsManualCooldownMs,
  viewPrsQuickCheckIntervalMs,
  viewPrsMergedFullSweepIntervalMs,
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  viewPrsLegacySchedulerFile,
});

// Per-repo-aware priority dispatcher (see REACT_MIGRATION_PLAN.md's
// dispatcher plan) - replaces the three flat setIntervals + flat
// in-progress booleans below with one registry of (repo, taskType) entries
// and one concurrency-budget-aware tick loop. Constructed after
// createViewPrsSchedulerHelpers specifically because it needs
// getViewPrsAutoRefreshRepos from it.
const dispatcherGhCostByTaskType = { quickCheck: 1, autoRefresh: 4, mergedDrain: 4 };

// Guards against a real footgun: VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET has
// no upper-bound relationship enforced against dispatcherGhCostByTaskType
// at the config layer (app-config.js just floors it at 1) - set it below
// the highest per-task cost (4, for autoRefresh/mergedDrain) and
// pickNextBatch would NEVER select those task types again: `cost <=
// remaining` is permanently false for every entry of that type, silently,
// forever, with nothing anywhere surfacing why background refresh/drain
// just stopped. Clamping up to the minimum viable budget (with a loud
// warning when clamping actually happens) makes that starvation
// impossible by construction instead of just documenting the risk.
const minViableDispatcherGhProcessBudget = Math.max(
  ...Object.values(dispatcherGhCostByTaskType),
);
const effectiveDispatcherGhProcessBudget = Math.max(
  viewPrsDispatcherGhProcessBudget,
  minViableDispatcherGhProcessBudget,
);
if (effectiveDispatcherGhProcessBudget !== viewPrsDispatcherGhProcessBudget) {
  console.warn(
    `[view-prs] VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET=${viewPrsDispatcherGhProcessBudget} is below ` +
      `the highest per-task-type cost (${minViableDispatcherGhProcessBudget}) - that task type would ` +
      `never be scheduled. Using ${effectiveDispatcherGhProcessBudget} instead.`,
  );
}

const dispatcherHelpers = createViewPrsDispatcherHelpers({
  console,
  parseTimestamp,
  viewPrsSchedulerState,
  getViewPrsAutoRefreshRepos,
  getOpenAutoCircuitRepos,
  // Read fresh (not cached) on every call so a PUT to /view-prs/user-defaults
  // takes effect on the next dispatch tick without a restart.
  getSchedulerRepoConfig: () => readUserDefaults()?.schedulerRepoConfig || {},
  defaultIntervalsByTaskType: {
    quickCheck: viewPrsQuickCheckIntervalMs,
    autoRefresh: viewPrsAutoIntervalMs,
    mergedDrain: viewPrsMergedFullSweepIntervalMs,
  },
  ghCostByTaskType: dispatcherGhCostByTaskType,
});
// Same override-checking pattern as every other call site in this file -
// lets tests spy on/replace dispatcherHelpers via module.exports before
// createViewPrsApp() runs.
const callDispatcherHelpers = () => module.exports.dispatcherHelpers || dispatcherHelpers;
// Fulfills the forward reference createViewPrsSchedulerHelpers was given
// above (getDispatcherDerivedFields) - see dispatcherHelpersRef's own
// comment there. Uses the override-aware callDispatcherHelpers, not the
// bare dispatcherHelpers, so a test monkeypatching module.exports.dispatcherHelpers
// is reflected in getViewPrsSchedulerPublicState() too.
dispatcherHelpersRef = { getPublicStateFields: () => callDispatcherHelpers().getPublicStateFields() };

const {
  JOB_NAMES,
  JOB_PHASES,
  emitJobEvent,
  emitSchedulerStateChanged,
  emitDataChanged,
  subscribeToJobEvents,
  getJobEventsSubscriberCount,
} = createViewPrsJobEventsHelpers({
  console,
  getViewPrsSchedulerPublicState,
  schedulerStateThrottleMs: viewPrsSchedulerStateThrottleMs,
});

// Same override-checking pattern as callRunViewPrsScript etc. - lets tests
// spy on/replace emitJobEvent via module.exports before createViewPrsApp()
// without needing a live SSE connection.
const callEmitJobEvent = (event) => {
  logBackgroundJobEvent(event);
  return (module.exports.emitJobEvent || emitJobEvent)(event);
};

// The background runs in Tools › Action log, by their job events: each
// quick check, and each skip that kept a run from happening (not one that
// found nothing to do). A full refresh - the drain's included - writes its
// own entry, with its timings, and what you start is logged by its route;
// the drain's refresh skipping is the drain's skip.
const NO_OP_SKIP_REASONS = new Set(["nothing-pending", "nothing-to-fetch"]);
const logBackgroundJobEvent = ({ job, phase, ok = null, detail } = {}) => {
  if (!detail || detail.origin === "you") return;
  const kind = typeof detail.kind === "string" ? detail.kind : job;
  const isSkip =
    phase === JOB_PHASES.SKIPPED &&
    !NO_OP_SKIP_REASONS.has(detail.reason) &&
    !(job === JOB_NAMES.AUTO_REFRESH && kind === "mergedQueueDrain");
  const isQuickCheck = phase === JOB_PHASES.FINISH && job === JOB_NAMES.QUICK_CHECK;
  if (!isSkip && !isQuickCheck) return;
  const { kind: _kind, origin: _origin, error, durationMs, ...rest } = detail;
  appendActionLogEntry({
    action: `job/${job}`,
    kind,
    origin: "background",
    triggeredAt: new Date(Date.now() - (Number(durationMs) || 0)).toISOString(),
    ...(isSkip ? { skipped: true, ok: null } : { ok }),
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
    detail: rest,
    ...(error ? { error: String(error) } : {}),
  });
};
const callEmitSchedulerStateChanged = (...args) =>
  (module.exports.emitSchedulerStateChanged || emitSchedulerStateChanged)(...args);
const callEmitDataChanged = (...args) =>
  (module.exports.emitDataChanged || emitDataChanged)(...args);

// Use command execution helpers
const formatScriptFailureMessage = (failure, fallbackMessage) =>
  _formatScriptFailureMessage(failure, fallbackMessage);

// Use command execution helper
const runViewPrsBashCommand = (bashArgs, maxBufferBytes, options) =>
  _runViewPrsBashCommand(bashArgs, maxBufferBytes, options);


// Use command execution helper
const runViewPrsScript = (scriptArgs, maxBufferBytes, options) =>
  _runViewPrsScript(scriptArgs, maxBufferBytes, options);

const callRunViewPrsScript = (...args) =>
  (module.exports.runViewPrsScript || runViewPrsScript)(...args);

// Same override-checking pattern as callRunViewPrsScript/callGetDependencyStatus
// above - lets tests monkeypatch module.exports.runViewPrsBashCommand before
// createViewPrsApp() so listMergedPrCandidates/listRepoLabels/applyLabelToPr/
// fetchGithubPrLabels below (all of which shell out to `gh` via this) can be
// tested without a real shell/gh/network call.
const callRunViewPrsBashCommand = (...args) =>
  (module.exports.runViewPrsBashCommand || runViewPrsBashCommand)(...args);

const callGetDependencyStatus = () =>
  (module.exports.getDependencyStatus || getDependencyStatus)();

// Use command execution helper
const runViewPrsShellScript = (scriptName, scriptArgs, maxBufferBytes, options) =>
  _runViewPrsShellScript(scriptName, scriptArgs, maxBufferBytes, options);

// Same override-checking pattern as callRunViewPrsScript/callRunViewPrsBashCommand
// above - lets tests monkeypatch module.exports.runViewPrsShellScript before
// createViewPrsApp() so getViewPrsBackfillPublicState/runViewPrsBackfillAction
// (GET /backfill, POST /backfill/start,/stop) can be tested without a real
// shell/backfill-missing-bg.sh call. runViewPrsShellScript had no such hook
// until now, unlike runViewPrsScript/runViewPrsBashCommand - every backfill
// route test was silently exercising a real spawn.
const callRunViewPrsShellScript = (...args) =>
  (module.exports.runViewPrsShellScript || runViewPrsShellScript)(...args);

const listMergedPrCandidates = async ({ repo, limit = 100 }) => {
  const safeRepo = toTrimmedString(repo);
  const safeLimit = Math.max(
    1,
    Math.min(200, Number.parseInt(String(limit), 10) || 100),
  );

  if (!isRepoSlug(safeRepo)) {
    throw new Error(`Invalid repo: ${safeRepo}`);
  }

  const result = await callRunViewPrsBashCommand(
    [
      "-lc",
      `GH_PAGER=cat gh pr list -R ${safeRepo} --state merged --limit ${safeLimit} --json number,mergedAt --jq '.'`,
    ],
    2 * 1024 * 1024,
    { timeoutMs: 120000, env: getRepoGhEnv(safeRepo) },
  );

  const parsed = (() => {
    try {
      return JSON.parse(String(result?.stdout || "[]"));
    } catch (_error) {
      return [];
    }
  })();

  return Array.isArray(parsed)
    ? parsed
      .map((item) => ({
        number: String(item?.number || "").trim(),
        mergedAt: String(item?.mergedAt || "").trim(),
      }))
      .filter((item) => /^\d+$/.test(item.number) && item.mergedAt)
      .sort((a, b) => {
        const aTime = Date.parse(a.mergedAt) || 0;
        const bTime = Date.parse(b.mergedAt) || 0;
        return bTime - aTime;
      })
    : [];
};

// Single-quotes a value for safe interpolation into a `bash -lc "..."`
// command string (closes the quote, appends an escaped literal quote,
// reopens it - the standard POSIX-shell single-quote escaping trick).
const shellQuoteSingle = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const isValidGithubLabelName = (value) => {
  const trimmed = toTrimmedString(value);
  return (
    trimmed.length > 0 &&
    trimmed.length <= 50 &&
    !/[\x00-\x1f\x7f]/.test(trimmed) // eslint-disable-line no-control-regex
  );
};

const listRepoLabels = async ({ repo }) => {
  const safeRepo = toTrimmedString(repo);

  if (!isRepoSlug(safeRepo)) {
    throw new Error(`Invalid repo: ${safeRepo}`);
  }

  const result = await callRunViewPrsBashCommand(
    [
      "-lc",
      `GH_PAGER=cat gh label list -R ${shellQuoteSingle(safeRepo)} --limit 200 --json name,color --jq '.'`,
    ],
    1 * 1024 * 1024,
    { timeoutMs: 30000, env: getRepoGhEnv(safeRepo) },
  );

  // A login shell (`bash -lc`) can echo unrelated startup noise (e.g. a
  // user's .bash_profile printing "Loaded .bash_profile") ahead of the
  // command's real output, so parse from the first JSON delimiter rather
  // than the whole stdout blob.
  const parsed = (() => {
    const stdout = String(result?.stdout || "[]");
    const jsonStart = stdout.search(/[[{]/);
    if (jsonStart === -1) {
      return [];
    }
    try {
      return JSON.parse(stdout.slice(jsonStart));
    } catch (_error) {
      return [];
    }
  })();

  return Array.isArray(parsed)
    ? parsed
      .map((item) => ({
        name: String(item?.name || "").trim(),
        color: String(item?.color || "").trim(),
      }))
      .filter((item) => item.name)
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
};

const applyLabelToPr = async ({ repo, prNumber, label }) => {
  const safeRepo = toTrimmedString(repo);
  const safePrNumber = toTrimmedString(prNumber);
  const safeLabel = toTrimmedString(label);

  if (!isRepoSlug(safeRepo)) {
    throw new Error(`Invalid repo: ${safeRepo}`);
  }
  if (!/^\d+$/.test(safePrNumber)) {
    throw new Error(`Invalid PR number: ${safePrNumber}`);
  }
  if (!isValidGithubLabelName(safeLabel)) {
    throw new Error(`Invalid label: ${safeLabel}`);
  }

  await callRunViewPrsBashCommand(
    [
      "-lc",
      `gh pr edit ${shellQuoteSingle(safePrNumber)} -R ${shellQuoteSingle(safeRepo)} --add-label ${shellQuoteSingle(safeLabel)}`,
    ],
    1 * 1024 * 1024,
    { timeoutMs: 30000, env: getRepoGhEnv(safeRepo) },
  );
};

// Fetches just the authoritative current label set for one PR - unlike a
// full `check-open-pr-updates.sh --pr <n>` refresh (which also re-fetches
// comments, reviews, file diffs, review threads, etc. and can take minutes
// for a PR with a lot of history, especially merged ones), this is a single
// small `gh` call so the UI can reflect a just-applied label immediately
// instead of waiting on the next scheduled full refresh.
// Resolves once gh finds the PR - on its GitHub Enterprise host, given one
// (gh's -R takes host/owner/repo) - and rejects with gh's reason otherwise.
const verifyGithubPr = async ({ repo, number, host = "" }) => {
  const safeRepo = toTrimmedString(repo);
  const safeNumber = toTrimmedString(number);
  if (!isRepoSlug(safeRepo) || !/^\d+$/.test(safeNumber)) {
    throw new Error(`Invalid PR: ${safeRepo}#${safeNumber}`);
  }
  const target = host ? `${host}/${safeRepo}` : safeRepo;
  try {
    await callRunViewPrsBashCommand(
      ["-lc", `gh pr view ${shellQuoteSingle(safeNumber)} -R ${shellQuoteSingle(target)} --json number --jq .number`],
      64 * 1024,
      { timeoutMs: 20000 },
    );
  } catch (failure) {
    const reason = String(failure?.stderr || "").trim().split("\n").filter(Boolean).pop();
    throw new Error(reason || describeFailure(failure), { cause: failure });
  }
};

const fetchGithubPrLabels = async ({ repo, prNumber }) => {
  const safeRepo = toTrimmedString(repo);
  const safePrNumber = toTrimmedString(prNumber);

  if (!isRepoSlug(safeRepo)) {
    throw new Error(`Invalid repo: ${safeRepo}`);
  }
  if (!/^\d+$/.test(safePrNumber)) {
    throw new Error(`Invalid PR number: ${safePrNumber}`);
  }

  const result = await callRunViewPrsBashCommand(
    [
      "-lc",
      `gh pr view ${shellQuoteSingle(safePrNumber)} -R ${shellQuoteSingle(safeRepo)} --json labels --jq '.labels | map(.name)'`,
    ],
    64 * 1024,
    { timeoutMs: 20000, env: getRepoGhEnv(safeRepo) },
  );

  const stdout = String(result?.stdout || "[]");
  const jsonStart = stdout.search(/[[{]/);
  if (jsonStart === -1) {
    return [];
  }
  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    return Array.isArray(parsed) ? parsed.map((name) => String(name || "").trim()).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
};

// Same lock directory the shell script's acquire_pr_state_lock()/
// release_pr_state_lock() use for viewPrsDataFile (PR_STATE_FILE), so a
// concurrent script run (a scheduled auto-refresh, a manual run, another
// ack) and this direct patch never interleave their read-modify-write.
const viewPrsDataFileLockDir = viewPrsDataFile.replace(/\.json$/, ".lock");

// The script holds it for one row's write; one older than a minute was
// left by a run killed mid-write (a timed-out script has no trap to let it
// go), and is passed over - not removed - rather than failing every label
// patch until the next run recovers it. Resolves whether it was taken.
const PR_STATE_LOCK_ABANDONED_MS = 60000;
const acquirePrStateLockForPatch = async ({ maxWaitMs = 5000 } = {}) => {
  const deadlineMs = Date.now() + maxWaitMs;
  for (;;) {
    try {
      fs.mkdirSync(viewPrsDataFileLockDir);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      let lockAgeMs = 0;
      try {
        lockAgeMs = Date.now() - fs.statSync(viewPrsDataFileLockDir).mtimeMs;
      } catch (_statError) {
        // Gone since: try again.
      }
      if (lockAgeMs > PR_STATE_LOCK_ABANDONED_MS) {
        return false;
      }
      if (Date.now() >= deadlineMs) {
        throw new Error("Unable to acquire PR state lock for label patch", {
          cause: error,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
};

const releasePrStateLockForPatch = () => {
  try {
    fs.rmdirSync(viewPrsDataFileLockDir);
  } catch (_error) {
    // Best effort.
  }
};

// Patches just `data.labels` for one stored PR entry directly into
// PR_STATE_FILE, instead of relying on a full script-driven refresh - see
// fetchGithubPrLabels for why. Returns true if a matching entry was found
// and patched.
const patchStoredPrLabels = async ({ repo, prNumber, labels }) => {
  const safeRepo = toTrimmedString(repo);
  const safePrNumber = toTrimmedString(prNumber);

  const lockHeld = await acquirePrStateLockForPatch();
  try {
    const current = readJsonFileIfExists(viewPrsDataFile, {});
    const entry = current?.byPrNumber?.[findPrEntryKey(current?.byPrNumber, safeRepo, safePrNumber)];
    if (!isObject(entry) || entry.repo !== safeRepo || !isObject(entry.data)) {
      return false;
    }

    entry.data.labels = Array.isArray(labels) ? labels : [];
    writeJsonFileWithBackup(viewPrsDataFile, current, "labels-patch");
    return true;
  } finally {
    if (lockHeld) releasePrStateLockForPatch();
  }
};

const parseBackfillCommandOutput = (stdout, stderr) => {
  const combined = [stdout, stderr]
    .filter((value) => String(value || "").trim())
    .join("\n")
    .trim();
  const statusLine = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) =>
      /^(Started background backfill|Backfill status|Stopped background backfill|Backfill is already running|Backfill is not running)\b/.test(
        line,
      ),
    );
  const pidMatch = combined.match(/PID:\s*(\d+)/i);
  const logMatch = combined.match(/Log:\s*(.+)$/im);
  const running = /Backfill status:\s*running\b/i.test(combined);

  return {
    running,
    pid: pidMatch ? pidMatch[1] : null,
    logFile: logMatch ? logMatch[1].trim() : null,
    summary: statusLine || (combined ? combined.split(/\r?\n/)[0] : ""),
    rawOutput: combined,
  };
};

const getBackfillLogTail = ({ maxLines = 80 } = {}) => {
  const linesRequested = Number.parseInt(String(maxLines), 10);
  const safeLines = Number.isFinite(linesRequested)
    ? Math.min(Math.max(linesRequested, 1), 500)
    : 80;

  if (!fs.existsSync(viewPrsBackfillLogFile)) {
    return {
      ok: true,
      logFile: viewPrsBackfillLogFile,
      linesRequested: safeLines,
      lineCount: 0,
      updatedAt: null,
      tail: "",
      isTruncated: false,
      summary: "Backfill log file does not exist yet",
    };
  }

  const stats = fs.statSync(viewPrsBackfillLogFile);
  const raw = fs.readFileSync(viewPrsBackfillLogFile, "utf8");
  const allLines = raw.split(/\r?\n/);
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }
  const tailLines = allLines.slice(-safeLines);

  return {
    ok: true,
    logFile: viewPrsBackfillLogFile,
    linesRequested: safeLines,
    lineCount: tailLines.length,
    totalLineCount: allLines.length,
    updatedAt: stats.mtime ? new Date(stats.mtime).toISOString() : null,
    tail: tailLines.join("\n"),
    isTruncated: allLines.length > tailLines.length,
    summary:
      tailLines.length > 0
        ? `Showing ${tailLines.length}${allLines.length > tailLines.length ? ` of ${allLines.length}` : ""} log line(s)`
        : "Backfill log is empty",
  };
};

const getViewPrsBackfillPublicState = async () => {
  try {
    const { stdout, stderr, command } = await callRunViewPrsShellScript(
      viewPrsBackfillManagerRelativePath,
      ["status"],
      1024 * 1024,
      { timeoutMs: viewPrsBackfillStatusTimeoutMs },
    );
    const parsed = parseBackfillCommandOutput(stdout, stderr);

    return {
      ok: true,
      command,
      running: parsed.running,
      pid: parsed.pid,
      logFile: parsed.logFile || viewPrsBackfillLogFile,
      pidFile: viewPrsBackfillPidFile,
      summary: parsed.summary || "Backfill status unavailable",
      output: parsed.rawOutput,
      error: null,
    };
  } catch (failure) {
    return {
      ok: false,
      command:
        failure?.command || `bash ${viewPrsBackfillManagerRelativePath} status`,
      running: false,
      pid: null,
      logFile: viewPrsBackfillLogFile,
      pidFile: viewPrsBackfillPidFile,
      summary: formatScriptFailureMessage(failure, "Backfill status failed"),
      output: failure?.stdout || "",
      error: formatScriptFailureMessage(failure, "Backfill status failed"),
    };
  }
};

const runViewPrsBackfillAction = async (action) => {
  const result = await callRunViewPrsShellScript(
    viewPrsBackfillManagerRelativePath,
    [action],
    4 * 1024 * 1024,
    { timeoutMs: viewPrsBackfillActionTimeoutMs },
  );
  const parsed = parseBackfillCommandOutput(result.stdout, result.stderr);

  return {
    ok: true,
    command: result.command,
    running: parsed.running,
    pid: parsed.pid,
    logFile: parsed.logFile || viewPrsBackfillLogFile,
    pidFile: viewPrsBackfillPidFile,
    summary: parsed.summary || `Backfill ${action} started`,
    output: parsed.rawOutput,
    error: null,
  };
};

// Use command execution helpers
const isCommandAvailable = (cmd) => _isCommandAvailable(cmd);
const getDependencyStatus = () => _getDependencyStatus();
const isGhAuthenticated = () => _isGhAuthenticated();

const getViewPrsViewerLogin = () => {
  const now = Date.now();
  if (
    cachedViewPrsViewerLogin &&
    now - cachedViewPrsViewerLoginAt < viewPrsViewerLoginCacheTtlMs
  ) {
    return cachedViewPrsViewerLogin;
  }

  const result = spawnSync(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      "query=query { viewer { login } }",
      "--jq",
      ".data.viewer.login",
    ],
    {
      encoding: "utf8",
      timeout: 15000,
    },
  );

  if (result.status !== 0) {
    return cachedViewPrsViewerLogin;
  }

  cachedViewPrsViewerLogin = toTrimmedString(result.stdout);
  cachedViewPrsViewerLoginAt = now;
  return cachedViewPrsViewerLogin;
};

// A per-repo run map, with the global run under its repo when the map
// lacks it (data written before the maps existed).
const withRunForItsRepo = (byRepo, run) => {
  const map = isObject(byRepo) ? { ...byRepo } : {};
  const repo = toTrimmedString(run?.repo);
  if (repo && !map[repo]) map[repo] = run;
  return map;
};

// detailSources: filled with where each row's full detail is (its detail
// file, or - data from before the files - the row's own fields), for
// readViewPrsPrDetails.
const readViewPrsDataUncached = (detailSources = new Map()) => {
  const rawUserState = readJsonFileIfExists(viewPrsUserStateFile, {});
  const normalizedUserState = normalizeViewPrsUserState(rawUserState);

  if (!fs.existsSync(viewPrsDataFile)) {
    return {
      byPrNumber: {},
      lastRun: null,
      lastFullRun: null,
      lastRunByRepo: {},
      lastFullRunByRepo: {},
      viewerLogin: getViewPrsViewerLogin(),
      actorsMap: {},
      actors: [],
      ackByRepo: normalizedUserState.ackByRepo,
      ackHistoryByRepo: normalizedUserState.ackHistoryByRepo,
      reverifyByRepo: normalizedUserState.reverifyByRepo,
      inReviewByRepo: normalizedUserState.inReviewByRepo,
      flaggedByRepo: normalizedUserState.flaggedByRepo,
      threadChecksByRepo: normalizedUserState.threadChecksByRepo,
    };
  }

  try {
    const raw = fs.readFileSync(viewPrsDataFile, "utf8");
    const parsed = JSON.parse(raw);
    const mergedUserState = migrateLegacyViewPrsUserState(
      parsed,
      normalizedUserState,
    );
    // Rows by repo and number (see view-prs-pr-keys.js): a file the script
    // hasn't migrated yet is read as if it had.
    const byPrNumberRaw = normalizePrEntryKeys(parsed.byPrNumber || {});
    const fallbackRepo = inferFallbackRepoForNotesOnlyEntries(
      byPrNumberRaw,
      parsed.lastRun,
    );
    const pendingUpdateKeys = getPendingUpdatePrNumberKeys();
    const liveSummaryByRepo = readLiveSummary().byRepo;
    const detailVersionByKey = new Map();
    const byPrNumber = Object.fromEntries(
      Object.entries(byPrNumberRaw)
        .filter(([, entry]) => !isViewPrsFixtureRow(entry))
        .map(([key, entry]) => {
          if (!isObject(entry)) {
            return [key, entry];
          }
          const { entry: withDetail, detailVersion } = loadViewPrsEntryDetail(entry);
          if (detailVersion) {
            detailVersionByKey.set(key, detailVersion);
            detailSources.set(
              key,
              withDetail !== entry
                ? { detailRef: entry.data.detailRef }
                : { inline: extractHeavyPrDetailFields(entry.data), detailVersion },
            );
          }
          const hydratedEntry = applyLiveSummaryToEntry(
            withDetail,
            liveSummaryByRepo[toTrimmedString(entry.repo)],
          );
          const notes = mergedUserState.notesByPrNumber[key];
          const withNotes = notes ? { ...hydratedEntry, notes } : hydratedEntry;
          const isUpdatePending = pendingUpdateKeys.has(
            buildPrEntryKey(withNotes?.repo, withNotes?.prNumber || prNumberFromKey(key)),
          );
          if (!isUpdatePending) {
            return [key, withNotes];
          }
          return [
            key,
            {
              ...withNotes,
              data: { ...(withNotes.data || {}), updatePending: true },
            },
          ];
        }),
    );
    collectMissingPrsFromDiffCache(byPrNumber, fallbackRepo).forEach(
      ({ key, prNumber, repo, fetchedAt }) => {
        const notes = mergedUserState.notesByPrNumber[key] || null;
        const diffOnlyEntry = buildGitDiffOnlyMergedEntry(prNumber, repo, fetchedAt);
        byPrNumber[key] = notes
          ? { ...diffOnlyEntry, notes }
          : diffOnlyEntry;
      },
    );
    // Notes for a PR with no row: a row of its own, under its notes' key
    // (its repo from that key; a bare number - notes the migration couldn't
    // place - the fallback repo).
    Object.entries(mergedUserState.notesByPrNumber).forEach(
      ([notesKey, notes]) => {
        const prNumber = prNumberFromKey(notesKey);
        const repo = notesKey.includes("#") ? notesKey.slice(0, notesKey.lastIndexOf("#")) : fallbackRepo;
        const key = findPrEntryKey(byPrNumber, repo, prNumber);
        if (byPrNumber[key]) {
          return;
        }
        byPrNumber[key] = buildNotesOnlyMergedEntry(prNumber, notes, repo);
      },
    );
    // Names from the full detail (thread comments, the timeline), before
    // the rows lose it.
    const actorMaps = buildViewPrsActorMaps(byPrNumber);
    detailVersionByKey.forEach((detailVersion, key) => {
      if (byPrNumber[key]) byPrNumber[key] = slimViewPrsEntry(byPrNumber[key], detailVersion);
    });
    return {
      byPrNumber,
      lastRun: parsed.lastRun || null,
      // The last full run (lastRun is any run, including one of chosen PRs);
      // data from before it had one: its lastRun.
      lastFullRun: parsed.lastFullRun || parsed.lastRun || null,
      // Each repo's (the global ones are only the latest repo's); data from
      // before them: the global one, for its repo.
      lastRunByRepo: withRunForItsRepo(parsed.lastRunByRepo, parsed.lastRun),
      lastFullRunByRepo: withRunForItsRepo(parsed.lastFullRunByRepo, parsed.lastFullRun || parsed.lastRun),
      viewerLogin:
        Object.values(byPrNumber)
          .map((entry) => toTrimmedString(entry?.data?.viewerLogin))
          .find(Boolean) || getViewPrsViewerLogin(),
      actorsMap: actorMaps.actorsMap,
      actors: actorMaps.actors,
      actorIdMoves: actorMaps.actorIdMoves,
      ackByRepo: mergedUserState.ackByRepo,
      ackHistoryByRepo: mergedUserState.ackHistoryByRepo,
      reverifyByRepo: mergedUserState.reverifyByRepo,
      inReviewByRepo: mergedUserState.inReviewByRepo,
      flaggedByRepo: mergedUserState.flaggedByRepo,
      threadChecksByRepo: mergedUserState.threadChecksByRepo,
    };
  } catch (error) {
    return {
      byPrNumber: {},
      lastRun: null,
      lastFullRun: null,
      lastRunByRepo: {},
      lastFullRunByRepo: {},
      viewerLogin: getViewPrsViewerLogin(),
      actorsMap: {},
      actors: [],
      ackByRepo: normalizedUserState.ackByRepo,
      ackHistoryByRepo: normalizedUserState.ackHistoryByRepo,
      reverifyByRepo: normalizedUserState.reverifyByRepo,
      inReviewByRepo: normalizedUserState.inReviewByRepo,
      flaggedByRepo: normalizedUserState.flaggedByRepo,
      threadChecksByRepo: normalizedUserState.threadChecksByRepo,
      readError: error.message,
    };
  }
};

// A file's or folder's stamp for the cache's key: to the stat's full
// precision (the data version's are whole milliseconds, and a test - or a
// quick run - can write twice in one).
const statStamp = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`;
  } catch (_error) {
    return "none";
  }
};

// readViewPrsData's last answer, kept while nothing it reads has changed:
// it parsed the data file, the user state and every PR's detail file each
// time (~100 MB for 960 PRs), for each of the page's polls and the
// scheduler's checks. The key is the data version (the data file, live
// summary, update queue, user state, sources, unreachable PRs, People),
// those files to the stat's full precision, and the folders the diff-only
// rows and the detail files are in. Nothing changes what it returns (they
// read it, or copy before changing), so one copy serves every caller.
let viewPrsDataCache = null;

const getViewPrsDataCacheKey = () =>
  [
    getViewPrsDataVersion(),
    statStamp(viewPrsDataFile),
    statStamp(viewPrsUserStateFile),
    statStamp(viewPrsLiveSummaryFile),
    statStamp(viewPrsActorsFile),
    statStamp(viewPrsPrDiffDir),
    statStamp(viewPrsPrDetailDir),
  ].join("|");

const readViewPrsData = () => {
  const key = getViewPrsDataCacheKey();
  if (viewPrsDataCache && viewPrsDataCache.key === key) {
    return viewPrsDataCache.data;
  }
  const detailSources = new Map();
  const data = readViewPrsDataUncached(detailSources);
  // A read that failed part way isn't kept: the next call tries again.
  viewPrsDataCache = data?.readError ? null : { key, data, detailSources };
  return data;
};

// For tests that change the files within one stat tick.
const clearViewPrsDataCache = () => {
  viewPrsDataCache = null;
};

// PRs' full detail fields (the text the list's rows go without), by key,
// with each one's version - as the list's rows have it, so the page knows
// when what it holds is out of date. Only those PRs' detail files are
// read: where each one is comes from readViewPrsData's cache.
const readViewPrsPrDetails = (prs = []) => {
  const result = {};
  if (!Array.isArray(prs) || prs.length === 0) return result;
  const data = readViewPrsData();
  const detailSources = viewPrsDataCache?.data === data ? viewPrsDataCache.detailSources : new Map();
  const byPrNumber = data?.byPrNumber || {};
  prs.forEach(({ repo, prNumber } = {}) => {
    const safeRepo = toTrimmedString(repo);
    const safePrNumber = toTrimmedString(prNumber);
    if (!safeRepo || !safePrNumber) return;
    const key = findPrEntryKey(byPrNumber, safeRepo, safePrNumber);
    const entry = byPrNumber[key];
    if (!isObject(entry) || toTrimmedString(entry.repo) !== safeRepo) return;
    const source = detailSources.get(key);
    let detailVersion = "";
    let detail = extractHeavyPrDetailFields(entry.data || {});
    if (source?.detailRef) {
      const loaded = loadViewPrsEntryDetail({ ...entry, data: { ...(entry.data || {}), detailRef: source.detailRef } });
      detailVersion = loaded.detailVersion;
      detail = extractHeavyPrDetailFields(loaded.entry?.data || {});
    } else if (source?.inline) {
      detailVersion = source.detailVersion;
      detail = source.inline;
    }
    result[buildPrEntryKey(safeRepo, safePrNumber)] = { repo: safeRepo, prNumber: safePrNumber, detailVersion, detail };
  });
  return result;
};

// The data file's stats and the version the page polls. Cheap (two stats
// and the in-memory queue), so the event stream can watch it
// (registerViewPrsEventsRoutes' getDataVersion).
const readViewPrsDataVersion = () => {
  if (!fs.existsSync(viewPrsDataFile)) {
    return { dataVersion: "missing", mtimeMs: 0, sizeBytes: 0 };
  }
  const stats = fs.statSync(viewPrsDataFile);
  const mtimeMs = Number.isFinite(stats.mtimeMs)
    ? Math.trunc(stats.mtimeMs)
    : Date.parse(String(stats.mtime || "")) || 0;
  // What readViewPrsData lays over the file counts too: a new live
  // summary, or a PR newly queued for update ("Update queued"), changes
  // the rows the page gets, so it changes the version the page polls.
  const pendingKeys = Array.from(getPendingUpdatePrNumberKeys()).sort().join(",");
  const pendingVersion = pendingKeys
    ? crypto.createHash("sha1").update(pendingKeys).digest("hex").slice(0, 12)
    : "none";
  // So does the user state: an Ack the script clears (or makes, or one
  // from another tab) reaches the page with its next poll - the manifest
  // carries the user state's per-repo maps (buildDataManifestPayload).
  const userStateStats = fs.existsSync(viewPrsUserStateFile) ? fs.statSync(viewPrsUserStateFile) : null;
  const userStateVersion = userStateStats ? `${Math.trunc(userStateStats.mtimeMs) || 0}-${userStateStats.size}` : "none";
  // And the sources: subscribing or unsubscribing a repo shows or hides its
  // rows (readVisibleViewPrsData).
  const sourcesStats = fs.existsSync(viewPrsSourcesFile) ? fs.statSync(viewPrsSourcesFile) : null;
  const sourcesVersion = sourcesStats ? `${Math.trunc(sourcesStats.mtimeMs) || 0}-${sourcesStats.size}` : "none";
  // And the PRs that couldn't be fetched, which the page shows with the
  // sources: a run that fetched none of its PRs writes no row, so nothing
  // else would move.
  const unreachableKeys = Object.keys(viewPrsSchedulerState.unreachablePrSince || {}).sort().join(",");
  const unreachableVersion = unreachableKeys
    ? crypto.createHash("sha1").update(unreachableKeys).digest("hex").slice(0, 12)
    : "none";
  // And the people: a save in Settings › People, or someone new added, moves
  // the names and logins the page shows (the manifest carries them).
  const actorsStats = fs.existsSync(viewPrsActorsFile) ? fs.statSync(viewPrsActorsFile) : null;
  const actorsVersion = actorsStats ? `${Math.trunc(actorsStats.mtimeMs) || 0}-${actorsStats.size}` : "none";
  return {
    dataVersion: `${mtimeMs}:${stats.size}:${getLiveSummaryVersion()}:${pendingVersion}:${userStateVersion}:${sourcesVersion}:${unreachableVersion}:${actorsVersion}`,
    mtimeMs,
    sizeBytes: Number.isFinite(stats.size) ? stats.size : 0,
  };
};

const getViewPrsDataVersion = () => {
  try {
    return readViewPrsDataVersion().dataVersion;
  } catch (_error) {
    return "unavailable";
  }
};

// The stored data as the page gets it: without the rows of repos that
// aren't in view - unsubscribed (hidden, not deleted), or never subscribed
// (a PR's repo runs of chosen PRs saved rows for) - except PRs added one by
// one (getRowVisibility).
const filterToVisibleRows = (data) => {
  const visibility = getRowVisibility();
  if (!visibility || !isObject(data?.byPrNumber)) return data;
  const byPrNumber = Object.fromEntries(
    Object.entries(data.byPrNumber).filter(
      ([, entry]) =>
        visibility.repos.has(entry?.repo) || visibility.prKeys.has(`${entry?.repo}#${entry?.prNumber}`),
    ),
  );
  return { ...data, byPrNumber };
};
const readVisibleViewPrsData = () => filterToVisibleRows(callReadViewPrsData());

// PRs fetched on their own that the last run of them couldn't fetch
// (deleted, or no longer visible to gh): viewPrsSchedulerState's
// unreachablePrSince, repo#number => since when - saved with the scheduler
// state, so a restart keeps them. Only PRs still fetched on their own: one
// removed (or its repo subscribed in full) drops out.
const recordUnreachablePrs = (repo, attemptedNumbers, missingNumbers) => {
  const before = JSON.stringify(viewPrsSchedulerState.unreachablePrSince || {});
  const next = { ...(viewPrsSchedulerState.unreachablePrSince || {}) };
  const missing = new Set((missingNumbers || []).map(String));
  (attemptedNumbers || []).map(String).forEach((number) => {
    const key = `${repo}#${number}`;
    if (!missing.has(number)) delete next[key];
    else if (!next[key]) next[key] = new Date().toISOString();
  });
  const explicitKeys = getRowVisibility()?.prKeys;
  if (explicitKeys) {
    Object.keys(next).forEach((key) => {
      if (!explicitKeys.has(key)) delete next[key];
    });
  }
  viewPrsSchedulerState.unreachablePrSince = next;
  if (JSON.stringify(next) !== before) {
    persistViewPrsSchedulerState();
    // The rows say so (unreachablePrs, in the live scheduler state).
    callEmitSchedulerStateChanged();
  }
};

// Each repo's last refresh that failed, until one works - viewPrsSchedulerState's
// refreshFailureByRepo, saved with the scheduler state: when it failed
// (`at`), since when its refreshes have been failing (`since`), why, and
// for a refresh of chosen PRs which (`prNumbers`; null for the repo's).
// The page marks the rows not fetched since (pr-row-freshness). A refresh
// of the repo that works clears it; one of chosen PRs clears those.
const recordRefreshOutcome = (repo, { ok, prNumbers, error = "" }) => {
  const failures = viewPrsSchedulerState.refreshFailureByRepo || {};
  const existing = failures[repo];
  const numbers = Array.isArray(prNumbers) ? prNumbers.map(String) : null;
  let next;
  if (ok) {
    if (!existing) return;
    const left = numbers && existing.prNumbers ? existing.prNumbers.filter((number) => !numbers.includes(number)) : [];
    // A refresh of chosen PRs leaves the repo's failure: its other PRs weren't refreshed.
    if (numbers && !existing.prNumbers) return;
    next = { ...failures };
    if (left.length > 0) next[repo] = { ...existing, prNumbers: left };
    else delete next[repo];
  } else {
    const now = new Date().toISOString();
    const failure =
      numbers && existing && !existing.prNumbers
        ? { ...existing, error }
        : {
          since: existing?.since || now,
          at: now,
          error,
          prNumbers: numbers ? [...new Set([...(existing?.prNumbers || []), ...numbers])] : null,
        };
    next = { ...failures, [repo]: failure };
  }
  viewPrsSchedulerState.refreshFailureByRepo = next;
  persistViewPrsSchedulerState();
  callEmitSchedulerStateChanged();
};

// A manual run of chosen PRs in a repo not fetched in full adds them, as
// by URL: otherwise the rows it saves would be hidden (filterToVisibleRows).
// Those in view already (their repo subscribed, or added) are left as they
// are.
const trackRunPrs = (repo, numbers) => {
  const visibility = getRowVisibility();
  if (!visibility || !repo || visibility.repos.has(repo)) return;
  const host = getRepoGhEnv(repo).GH_HOST || "";
  numbers
    .filter((number) => !visibility.prKeys.has(`${repo}#${number}`))
    .forEach((number) => {
      try {
        viewPrsSourcesStorage.addTrackedPr(
          { repo, number, host, url: `https://${host || "github.com"}/${repo}/pull/${number}` },
          { seedRepos: seedSubscriptionRepos },
        );
      } catch (error) {
        console.warn(`[view-prs] couldn't add ${repo}#${number} to the sources: ${error.message}`);
      }
    });
};

// The sources, for the page (Settings › Sources, the repo pickers): with
// the PRs that couldn't be fetched, and the repos VIEW_PRS_AUTO_REPOS
// fetches in full whatever the file says (envRepos - unsubscribing one
// can't hide it). Null until the file is seeded.
const getSourcesForPage = () => {
  const sources = viewPrsSourcesStorage.loadSources({ seedRepos: seedSubscriptionRepos });
  if (!sources) return null;
  const explicitByRepo = viewPrsSourcesStorage.getExplicitPrNumbersByRepo(sources);
  return {
    ...sources,
    // Still fetched on their own (one removed since isn't).
    unreachable: Object.fromEntries(
      Object.entries(viewPrsSchedulerState.unreachablePrSince || {}).filter(([key]) => {
        const hashIndex = key.lastIndexOf("#");
        return (explicitByRepo[key.slice(0, hashIndex)] || []).includes(key.slice(hashIndex + 1));
      }),
    ),
    envRepos: parseRepoCsv(process.env.VIEW_PRS_AUTO_REPOS || "").filter((repo) => isRepoSlug(repo)),
  };
};

const getViewPrsDataMeta = () => {
  try {
    const { dataVersion, mtimeMs, sizeBytes } = readViewPrsDataVersion();
    if (dataVersion === "missing") {
      return {
        dataVersion,
        lastModifiedAt: null,
        sizeBytes: 0,
      };
    }

    // Per repo: when its open PRs were last listed, the last failure, and
    // how often it's listed (its quick check's interval; null when the repo
    // isn't checked in the background) - the page marks rows stale from it.
    const liveSummary = Object.fromEntries(
      Object.entries(getLiveSummaryMeta()).map(([repo, meta]) => [
        repo,
        { ...meta, quickCheckIntervalMs: callDispatcherHelpers().getEntryIntervalMs?.(repo, "quickCheck") ?? null },
      ]),
    );

    // Every repo checked in the background, listed or not (the live summary
    // can be off, or not have run yet): its quick check's interval, and
    // until when its background updates are paused (its circuit breaker is
    // open after repeated failures; null when not). A repo missing here
    // isn't checked in the background.
    const openCircuitRepos = new Set(getOpenAutoCircuitRepos());
    const backgroundUpdates = Object.fromEntries(
      Object.entries(callDispatcherHelpers().getEntryIntervalsByRepo?.("quickCheck") || {}).map(([repo, intervalMs]) => [
        repo,
        {
          quickCheckIntervalMs: intervalMs,
          pausedUntil: openCircuitRepos.has(repo)
            ? viewPrsSchedulerState.autoCircuitByRepo?.[repo]?.circuitOpenUntil ?? null
            : null,
        },
      ]),
    );

    return {
      dataVersion,
      lastModifiedAt: mtimeMs > 0 ? new Date(mtimeMs).toISOString() : null,
      sizeBytes,
      liveSummary,
      backgroundUpdates,
      sources: getSourcesForPage(),
    };
  } catch (error) {
    return {
      dataVersion: "unavailable",
      lastModifiedAt: null,
      sizeBytes: 0,
      readError: error.message,
    };
  }
};

const getViewPrsDataManifest = (dataOverride = null) => {
  try {
    const data = dataOverride && isObject(dataOverride)
      ? dataOverride
      : readViewPrsData();
    return buildViewPrsDataManifest(data);
  } catch (_error) {
    return {};
  }
};

// How long before a PR queued as no longer open is queued again: one that
// can't be fetched (access lost, the repo moved) would otherwise fail a run
// of its repo after every quick check, and its circuit breaker would pause
// the whole repo. A merged one is fetched with its first, and isn't open
// any more.
const NO_LONGER_OPEN_REQUEUE_MS = 6 * 60 * 60 * 1000;

// Of a repo's open rows the listing no longer has, those to queue now: not
// queued in the last NO_LONGER_OPEN_REQUEUE_MS - and records when. The
// repo's other entries go (those PRs are open again, or fetched), saved
// with the scheduler state so a restart doesn't queue them all again.
const takeNoLongerOpenToQueue = (repo, numbers, nowMs = Date.now()) => {
  const before = viewPrsSchedulerState.noLongerOpenQueuedAt || {};
  const next = Object.fromEntries(Object.entries(before).filter(([key]) => !key.startsWith(`${repo}#`)));
  const toQueue = [];
  numbers.map(String).forEach((number) => {
    const key = `${repo}#${number}`;
    const queuedAtMs = Date.parse(String(before[key] || ''));
    if (Number.isFinite(queuedAtMs) && nowMs - queuedAtMs < NO_LONGER_OPEN_REQUEUE_MS) {
      next[key] = before[key];
      return;
    }
    next[key] = new Date(nowMs).toISOString();
    toQueue.push(number);
  });
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    viewPrsSchedulerState.noLongerOpenQueuedAt = next;
    persistViewPrsSchedulerState();
  }
  return toQueue;
};

// The PR numbers a run of chosen PRs couldn't fetch: its "Could not fetch
// PR(s): 9,10" line, which it prints at its end - so having it, the run
// got through the rest.
const parseUnfetchedPrNumbers = (failure) => {
  const match = String(failure?.stderr || "").match(/Could not fetch PR\(s\): ([\d,]+)/);
  return match ? match[1].split(",").filter(Boolean) : [];
};

// The PRs added from a repo by URL (or a "numbers" subscription's), still
// worth checking, that its last full run didn't refresh: too old for its
// listings. Their rows' updatedAt isn't that run's, or they have none yet.
const getExplicitPrsMissedByFullRun = (repo) => {
  const numbers = getExplicitPrNumbersInWindow(repo);
  if (numbers.length === 0) return [];
  const data = callReadViewPrsData();
  const fullRunStamp = data?.lastFullRunByRepo?.[repo]?.updatedAt;
  return numbers.filter((number) => {
    const row = data?.byPrNumber?.[`${repo}#${number}`];
    return !row || !fullRunStamp || row.updatedAt !== fullRunStamp;
  });
};

// Auto-refresh logic
// prNumbersByRepo: { [repo]: ["12", ...] } - those repos refresh only these
// PRs (the script's --prs), the PRs a quick check found changed, instead
// of the whole repo; only these are then cleared from its queue.
const runViewPrsAutoRefresh = async ({
  skipCooldownChecks = false,
  reposOverride = null,
  prNumbersByRepo = {},
  // What it is in the Activity popover: "autoRefresh" (a full refresh),
  // "changedPrs" (just the PRs a quick check found changed - the
  // dispatcher's fast-follow), or "mergedQueueDrain" (the drain running
  // it), or "addPr" (a PR just added, fetched). Also in its job events'
  // detail, as `kind`.
  progressKind = "autoRefresh",
  // Who started it, for the Activity popover: "background" (the scheduler)
  // or "you" (a request).
  progressOrigin = "background",
} = {}) => {
  // Each repo's PR numbers to refresh, or null for the whole repo: those
  // asked for, or else - for a repo not fetched in full (only PRs added
  // from it, or a "numbers" subscription) - its own PRs, never the whole
  // repo (getExplicitRefreshNumbers). Resolved once per repo.
  const targetPrNumbersByRepo = new Map();
  const getTargetPrNumbers = (repo) => {
    if (!targetPrNumbersByRepo.has(repo)) {
      const requested =
        Array.isArray(prNumbersByRepo?.[repo]) && prNumbersByRepo[repo].length > 0
          ? prNumbersByRepo[repo].map(String)
          : null;
      targetPrNumbersByRepo.set(repo, requested || getExplicitRefreshNumbers(repo));
    }
    return targetPrNumbersByRepo.get(repo);
  };
  // Resolved up front (same reasoning as runViewPrsQuickCheck's own
  // quickCheckTargetRepos) so a call whose entire target set overlaps an
  // ALREADY-running auto refresh can defer immediately, preserving today's
  // exact "fully blocked" shape - while a call whose targets only PARTIALLY
  // overlap proceeds with just the free repos instead of being blocked
  // entirely by an unrelated repo's refresh (see autoRefreshInProgressRepos's
  // own comment near viewPrsSchedulerState's definition - this is the same
  // Set, now also used for this self-exclusion check, not just the
  // cross-task one runViewPrsQuickCheck reads).
  // Less any repo with nothing to fetch: one not fetched in full whose own
  // PRs have all been merged or closed for long enough ([]). None left:
  // skipped, rather than a run of no repo, which would count as failed.
  const candidateAutoRefreshRepos =
    Array.isArray(reposOverride) && reposOverride.length > 0
      ? reposOverride
      : getViewPrsAutoRefreshRepos();
  const requestedAutoRefreshRepos = candidateAutoRefreshRepos.filter(
    (repo) => getTargetPrNumbers(repo)?.length !== 0,
  );
  if (candidateAutoRefreshRepos.length > 0 && requestedAutoRefreshRepos.length === 0) {
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.SKIPPED,
      detail: { kind: progressKind, origin: progressOrigin, reason: "nothing-to-fetch", repos: candidateAutoRefreshRepos },
    });
    return { skipped: true, skipReason: "nothing-to-fetch" };
  }
  // Tracked separately (not just the survivors below) so a caller grouping
  // several repos into one call - like the dispatcher's own per-task-type
  // batching - can tell exactly which of ITS repos were silently excluded
  // from this run, instead of only knowing whether the call as a WHOLE
  // skipped or not (see runTaskGroup's own per-repo resultsByRepo).
  const reposExcludedForAlreadyInProgress = requestedAutoRefreshRepos.filter(
    (repo) => viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo),
  );
  let reposToRefresh = requestedAutoRefreshRepos.filter(
    (repo) => !viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo),
  );
  if (requestedAutoRefreshRepos.length > 0 && reposToRefresh.length === 0) {
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.SKIPPED,
      detail: { kind: progressKind, origin: progressOrigin, reason: "already-in-progress", repos: requestedAutoRefreshRepos },
    });
    return { skipped: true, skipReason: "already-in-progress" };
  }

  const nowMs = Date.now();
  // Hoisted out of the `if` block below (not just declared inside it) so
  // the final return can report it too - same reasoning as
  // reposExcludedForAlreadyInProgress above.
  let reposExcludedForCircuitOpen = [];

  if (!skipCooldownChecks) {
    // Per-repo, same partial-skip shape as the in-progress check above: one
    // repo's open circuit no longer blocks a DIFFERENT repo's refresh (see
    // autoCircuitByRepo's own comment near viewPrsSchedulerState's
    // definition).
    const reposWithOpenCircuit = reposToRefresh.filter(
      (repo) => getViewPrsAutoCircuitOpenState({ nowMs, repo }).isOpen,
    );
    reposExcludedForCircuitOpen = reposWithOpenCircuit;
    if (reposWithOpenCircuit.length > 0) {
      const firstOpenState = getViewPrsAutoCircuitOpenState({
        nowMs,
        repo: reposWithOpenCircuit[0],
      });
      if (reposWithOpenCircuit.length === reposToRefresh.length) {
        viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
        viewPrsSchedulerState.lastAutoSkipReason = `auto refresh circuit open for ${reposWithOpenCircuit.join(", ")} until ${firstOpenState.openUntilIso}`;
        viewPrsSchedulerState.lastAutoError = null;
        callEmitJobEvent({
          job: JOB_NAMES.AUTO_REFRESH,
          phase: JOB_PHASES.SKIPPED,
          detail: {
            kind: progressKind,
            origin: progressOrigin,
            reason: "circuit-open",
            message: viewPrsSchedulerState.lastAutoSkipReason,
            repos: reposWithOpenCircuit,
          },
        });
        return { skipped: true, skipReason: "circuit-open" };
      }
      reposToRefresh = reposToRefresh.filter(
        (repo) => !reposWithOpenCircuit.includes(repo),
      );
    }
  }

  const dependencyStatus = callGetDependencyStatus();
  if (!dependencyStatus.ok) {
    viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastAutoSkipReason = `missing dependencies: ${dependencyStatus.missing.join(
      ", ",
    )}`;
    viewPrsSchedulerState.lastAutoError = null;
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.SKIPPED,
      detail: {
        kind: progressKind,
        origin: progressOrigin,
        reason: "missing-dependencies",
        missing: dependencyStatus.missing,
      },
    });
    return { skipped: true, skipReason: "missing-dependencies" };
  }

  // A manual full refresh of a repo makes its own auto refresh redundant
  // for a while - not other repos', nor a refresh of chosen PRs, which is
  // for changes found since. Same partial-skip shape as the circuit check.
  let reposExcludedForManualCooldown = [];
  if (!skipCooldownChecks) {
    const manualCooldownReasonFor = (repo) =>
      getTargetPrNumbers(repo)
        ? null
        : getManualCooldownSkipReason({
          nowMs,
          lastManualRunAt: getManualFullRunAtForRepo(repo),
          manualCooldownMs: viewPrsManualCooldownMs,
        });
    reposExcludedForManualCooldown = reposToRefresh.filter((repo) => manualCooldownReasonFor(repo));
    if (reposExcludedForManualCooldown.length > 0 && reposExcludedForManualCooldown.length === reposToRefresh.length) {
      const skipReason = manualCooldownReasonFor(reposExcludedForManualCooldown[0]);
      viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
      viewPrsSchedulerState.lastAutoSkipReason = skipReason;
      viewPrsSchedulerState.lastAutoError = null;
      callEmitJobEvent({
        job: JOB_NAMES.AUTO_REFRESH,
        phase: JOB_PHASES.SKIPPED,
        detail: { kind: progressKind, origin: progressOrigin, reason: "manual-cooldown", message: skipReason, repos: reposToRefresh },
      });
      return { skipped: true, skipReason: "manual-cooldown" };
    }
    reposToRefresh = reposToRefresh.filter((repo) => !reposExcludedForManualCooldown.includes(repo));
  }

  // Only ADD this call's own repos to the shared Set - don't replace it -
  // a DIFFERENT, concurrently-running auto refresh call (for other repos)
  // may already have its own entries in it (same reasoning as
  // quickCheckInProgressRepos's own finally-block comment). Cleared back
  // out (not reset to empty) in this function's own finally below.
  reposToRefresh.forEach((repo) =>
    viewPrsSchedulerState.autoRefreshInProgressRepos.add(repo),
  );
  viewPrsSchedulerState.isAutoRunInProgress = true;
  viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
  viewPrsSchedulerState.lastAutoSkipReason = null;

  const autoStartedAt = viewPrsSchedulerState.lastAutoAttemptAt;
  const autoTriggerMs = Date.now();
  let emittedAutoRefreshStart = false;
  let progressTask = null;
  let finishSuccessCount = 0;
  let finishFailureCount = 0;
  let finishRepos = [];

  try {
    // reposToRefresh already resolved and filtered up front - reused here,
    // not recomputed (the earlier resolution already excluded repos busy
    // with another in-flight auto refresh).
    console.log(
      `[view-prs] auto refresh repos (${reposToRefresh.length}): ${reposToRefresh.join(", ") || "(none)"}`,
    );
    finishRepos = reposToRefresh;
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.START,
      detail: { repos: reposToRefresh, repoCount: reposToRefresh.length, kind: progressKind },
    });
    emittedAutoRefreshStart = true;
    const targetCounts = reposToRefresh.map((repo) => getTargetPrNumbers(repo)?.length ?? null);
    progressTask = startProgressTask({
      kind: progressKind,
      origin: progressOrigin,
      repos: reposToRefresh,
      unit: "PR",
      total: targetCounts.every((count) => count !== null) ? targetCounts.reduce((sum, count) => sum + count, 0) : null,
    });
    const refreshResults = new Array(reposToRefresh.length);
    const repoConcurrency = Math.min(
      reposToRefresh.length,
      getViewPrsAutoRepoConcurrency(),
    );
    let nextRepoIndex = 0;

    const runRepoRefresh = async (repo) => {
      const targetPrNumbers = getTargetPrNumbers(repo);
      // Its chosen PRs, queued until each one's fetch starts (then the
      // script's progress marker makes it active). A full refresh queues
      // none: its PRs are active one by one as it reaches them.
      const seededPrNumbers = targetPrNumbers || [];
      const stillQueued = new Set(seededPrNumbers.map(String));
      const repoStartMs = Date.now();
      let repoFirstPrProgressMs = null;

      // The repo's run, of these PRs or (null) the whole repo. What a run
      // that succeeds still warns about (a PR it couldn't look up, say) goes
      // to the server's log - not its progress markers.
      const runScriptForRepo = async (prNumbers) => {
        const result = await runScriptForRepoQuietly(prNumbers);
        String(result?.stderr || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("__VIEW_PRS_PROGRESS__:"))
          .slice(0, 10)
          .forEach((line) => console.warn(`[view-prs] ${repo}: ${line}`));
        return result;
      };
      const runScriptForRepoQuietly = (prNumbers) =>
        callRunViewPrsScript(
          [
            viewPrsRunScriptRelativePath,
            "--quiet",
            "--open",
            "none",
            "--repo",
            repo,
            "--show-reason",
            ...(prNumbers ? ["--prs", prNumbers.join(",")] : []),
          ],
          10 * 1024 * 1024,
          {
            timeoutMs: viewPrsAutoScriptTimeoutMs,
            env: getRepoGhEnv(repo),
            // Tags every active-PR-tracking call this run makes (this
            // options.repo, read by runViewPrsBashCommand) with the repo
            // being scanned - see buildActivePrKey's own comment.
            repo,
            progressTracker: {
              onStart: (prNumber) => {
                if (repoFirstPrProgressMs === null) {
                  repoFirstPrProgressMs = Date.now();
                }
                if (stillQueued.delete(String(prNumber))) removeSchedulerQueuedPrNumbers([prNumber], repo);
              },
              ...countFinishedPrs(progressTask),
            },
          },
        );

      try {
        addSchedulerQueuedPrNumbers(seededPrNumbers, repo);
        // A run of chosen PRs that fetched some of them did its job: the
        // ones it couldn't (deleted, or no longer visible) are reported,
        // not the repo's run failed - one gone PR added by URL would
        // otherwise fail every run of its repo, and its circuit breaker
        // would stop the rest. One that fetched none still fails.
        let missingPrNumbers = [];
        try {
          await runScriptForRepo(targetPrNumbers);
        } catch (failure) {
          missingPrNumbers = targetPrNumbers ? parseUnfetchedPrNumbers(failure) : [];
          if (missingPrNumbers.length > 0) {
            recordUnreachablePrs(repo, targetPrNumbers, missingPrNumbers);
            // Off the queue, so the next run of its repo doesn't fail on
            // them again - fetched once more when a new change queues them.
            clearPendingNumbersForRepo(repo, missingPrNumbers);
          }
          if (missingPrNumbers.length === 0 || missingPrNumbers.length >= targetPrNumbers.length) {
            throw failure;
          }
          console.warn(`[view-prs] couldn't fetch ${repo} PR(s) ${missingPrNumbers.join(", ")}; refreshed the rest`);
        }
        if (targetPrNumbers) recordUnreachablePrs(repo, targetPrNumbers, missingPrNumbers);
        // A full run, then the PRs added from this repo by URL it didn't
        // refresh (too old for its listings), on their own. Their failing
        // doesn't fail the full run.
        if (!targetPrNumbers) {
          const missedPrNumbers = getExplicitPrsMissedByFullRun(repo);
          if (missedPrNumbers.length > 0) {
            // Whether it got to its end, so says which it fetched.
            let followUpFinished = true;
            try {
              await runScriptForRepo(missedPrNumbers);
            } catch (failure) {
              missingPrNumbers = parseUnfetchedPrNumbers(failure);
              followUpFinished = missingPrNumbers.length > 0;
              console.warn(`[view-prs] refreshing ${repo}'s added PR(s) ${missedPrNumbers.join(", ")} failed: ${describeFailure(failure)}`);
            }
            if (followUpFinished) recordUnreachablePrs(repo, missedPrNumbers, missingPrNumbers);
          }
        }
        const repoFinishedMs = Date.now();
        // A full run refreshes both sections, so anything queued by the
        // quick-check for this repo has now been addressed; a run of chosen
        // PRs addressed just those.
        if (targetPrNumbers) {
          clearPendingNumbersForRepo(repo, targetPrNumbers);
        } else {
          clearPendingForRepo(repo);
        }
        recordRefreshOutcome(repo, { ok: true, prNumbers: targetPrNumbers });
        return {
          ok: true,
          repo,
          targeted: Boolean(targetPrNumbers),
          missingPrNumbers,
          metrics: {
            repo,
            targetedPrCount: targetPrNumbers ? targetPrNumbers.length : null,
            startedAt: new Date(repoStartMs).toISOString(),
            completedAt: new Date(repoFinishedMs).toISOString(),
            durationMs: repoFinishedMs - repoStartMs,
            queueWaitMs: Math.max(0, repoStartMs - autoTriggerMs),
            seededPrCount: seededPrNumbers.length,
            firstPrProgressAt:
              repoFirstPrProgressMs === null
                ? null
                : new Date(repoFirstPrProgressMs).toISOString(),
            timeToFirstPrProgressMs:
              repoFirstPrProgressMs === null
                ? null
                : Math.max(0, repoFirstPrProgressMs - repoStartMs),
          },
        };
      } catch (failure) {
        const failureMessage =
          failure?.didTimeout === true
            ? `Auto refresh timed out after ${Math.round(
              Number(failure?.timeoutMs || viewPrsAutoScriptTimeoutMs) / 1000,
            )}s`
            // With the script's reason (its last stderr line), not just its exit code.
            : describeFailure(failure);
        const repoFinishedMs = Date.now();
        recordRefreshOutcome(repo, { ok: false, prNumbers: targetPrNumbers, error: failureMessage });
        return {
          ok: false,
          repo,
          errorMessage: `${repo}: ${failureMessage}`,
          metrics: {
            repo,
            startedAt: new Date(repoStartMs).toISOString(),
            completedAt: new Date(repoFinishedMs).toISOString(),
            durationMs: repoFinishedMs - repoStartMs,
            queueWaitMs: Math.max(0, repoStartMs - autoTriggerMs),
            seededPrCount: seededPrNumbers.length,
            firstPrProgressAt:
              repoFirstPrProgressMs === null
                ? null
                : new Date(repoFirstPrProgressMs).toISOString(),
            timeToFirstPrProgressMs:
              repoFirstPrProgressMs === null
                ? null
                : Math.max(0, repoFirstPrProgressMs - repoStartMs),
          },
        };
      } finally {
        removeSchedulerQueuedPrNumbers([...stillQueued], repo);
        stillQueued.clear();
      }
    };

    if (repoConcurrency > 0) {
      const runWorker = async () => {
        while (true) {
          const currentIndex = nextRepoIndex;
          nextRepoIndex += 1;
          if (currentIndex >= reposToRefresh.length) {
            return;
          }
          refreshResults[currentIndex] = await runRepoRefresh(
            reposToRefresh[currentIndex],
          );
        }
      };

      await Promise.all(
        Array.from({ length: repoConcurrency }, () => runWorker()),
      );
    }

    const failures = refreshResults
      .filter((result) => result && result.ok === false)
      .map((result) => result.errorMessage);
    // Repo names (not just counts/messages) so the circuit breaker below
    // can be scoped to exactly the repos that actually failed/succeeded in
    // THIS batch, not the whole batch indiscriminately.
    const failedRepos = refreshResults
      .filter((result) => result && result.ok === false)
      .map((result) => result.repo);
    // Per-repo error text (not just the repo-name list above) - consumed by
    // runTaskGroup's own resultsByRepo so each dispatcher entry records its
    // OWN failure message, not a shared one across the whole batch.
    const failedRepoErrors = {};
    refreshResults
      .filter((result) => result && result.ok === false)
      .forEach((result) => {
        failedRepoErrors[result.repo] = result.errorMessage;
      });
    const succeededRepos = refreshResults
      .filter((result) => result && result.ok === true)
      .map((result) => result.repo);
    const successCount = succeededRepos.length;
    finishSuccessCount = successCount;
    finishFailureCount = failures.length;
    const repoMetrics = refreshResults
      .filter((result) => result && result.metrics)
      .map((result) => result.metrics);
    const earliestFirstPrProgressIso = repoMetrics
      .map((metric) => String(metric.firstPrProgressAt || "").trim())
      .filter(Boolean)
      .sort()[0] || null;
    const timeToFirstPrProgressMs = earliestFirstPrProgressIso
      ? Math.max(0, Date.parse(earliestFirstPrProgressIso) - autoTriggerMs)
      : null;

    if (successCount > 0) {
      viewPrsSchedulerState.lastAutoRunAt = new Date().toISOString();
      persistViewPrsSchedulerState();
      console.log(
        `[view-prs] auto refresh complete for ${successCount} repo(s) at ${viewPrsSchedulerState.lastAutoRunAt}`,
      );

      // Automatically split heavy PR detail arrays into separate files
      try {
        runPrDetailMigration({
          silent: true,
          dataFile: viewPrsDataFile,
          detailDir: viewPrsPrDetailDir,
          backupDir: viewPrsBackupDir,
        });
      } catch (migrationError) {
        console.error(
          `[view-prs] warning: PR detail split failed: ${migrationError.message || migrationError}`,
        );
      }
    }

    // Scoped to exactly the repos that succeeded/failed in THIS batch, not
    // the whole batch indiscriminately - a 3-repo batch where 1 fails no
    // longer resets/trips every repo's breaker, only that one's (see
    // autoCircuitByRepo's own comment).
    resetAutoCircuitFailuresForRepos(succeededRepos);

    viewPrsSchedulerState.lastAutoError =
      failures.length > 0
        ? failures.join("; ")
        : successCount > 0
          ? null
          : "Auto refresh did not run for any repo";

    if (failedRepos.length > 0) {
      recordViewPrsAutoRefreshFailure(failedRepos);
    }

    appendActionLogEntry({
      action: "auto-refresh",
      kind: progressKind,
      origin: progressOrigin,
      triggeredAt: autoStartedAt,
      durationMs: Date.now() - autoTriggerMs,
      ok: failures.length === 0 && successCount > 0,
      detail: {
        repos: reposToRefresh.join(", "),
        successCount,
        failureCount: failures.length,
        repoConcurrency,
        repoMetrics,
        firstPrProgressAt: earliestFirstPrProgressIso,
        timeToFirstPrProgressMs,
      },
      ...(failures.length > 0 ? { error: failures.join("; ") } : {}),
    });

    if (failures.length > 0) {
      console.error(
        `[view-prs] auto refresh had failures: ${viewPrsSchedulerState.lastAutoError}`,
      );
    }

    // Per-repo outcome, not just an aggregate - a caller grouping several
    // repos into one call (the dispatcher's own per-task-type batching)
    // needs to know exactly which of ITS repos actually ran vs. were
    // silently excluded, instead of treating the whole batch as one
    // verdict (see runTaskGroup's own resultsByRepo).
    return {
      skipped: false,
      succeededRepos,
      // Of those, the ones that refreshed only chosen PRs (prNumbersByRepo).
      targetedRepos: refreshResults
        .filter((result) => result && result.ok === true && result.targeted)
        .map((result) => result.repo),
      // Of those, the PRs each couldn't fetch (see runRepoRefresh).
      missingPrNumbersByRepo: Object.fromEntries(
        refreshResults
          .filter((result) => result?.ok === true && result.missingPrNumbers?.length > 0)
          .map((result) => [result.repo, result.missingPrNumbers]),
      ),
      failedRepos,
      failedRepoErrors,
      reposExcludedForAlreadyInProgress,
      reposExcludedForCircuitOpen,
      reposExcludedForManualCooldown,
    };
  } catch (failure) {
    viewPrsSchedulerState.lastAutoError = describeFailure(failure);
    // The whole call threw before any individual repo's own result was
    // known (e.g. a setup error) - attribute the failure to every repo
    // this call was attempting, since there's no finer-grained info here.
    recordViewPrsAutoRefreshFailure(reposToRefresh);
    reposToRefresh.forEach((repo) =>
      recordRefreshOutcome(repo, { ok: false, prNumbers: getTargetPrNumbers(repo), error: viewPrsSchedulerState.lastAutoError }),
    );
    appendActionLogEntry({
      action: "auto-refresh",
      kind: progressKind,
      origin: progressOrigin,
      triggeredAt: autoStartedAt,
      durationMs: Date.now() - autoTriggerMs,
      ok: false,
      detail: { repos: reposToRefresh.join(", ") },
      error: viewPrsSchedulerState.lastAutoError,
    });
    console.error(
      `[view-prs] auto refresh failed: ${viewPrsSchedulerState.lastAutoError}`,
    );
    return {
      skipped: false,
      succeededRepos: [],
      failedRepos: reposToRefresh,
      reposExcludedForAlreadyInProgress,
      reposExcludedForCircuitOpen,
      error: viewPrsSchedulerState.lastAutoError,
    };
  } finally {
    // Remove only THIS call's own repos, not the whole Set - a different,
    // concurrently-running auto refresh call (for other repos) may still
    // have its own entries in it.
    reposToRefresh.forEach((repo) =>
      viewPrsSchedulerState.autoRefreshInProgressRepos.delete(repo),
    );
    viewPrsSchedulerState.isAutoRunInProgress =
      viewPrsSchedulerState.autoRefreshInProgressRepos.size > 0;
    progressTask?.finish();
    if (emittedAutoRefreshStart) {
      callEmitJobEvent({
        job: JOB_NAMES.AUTO_REFRESH,
        phase: JOB_PHASES.FINISH,
        ok: finishFailureCount === 0 && finishSuccessCount > 0,
        detail: {
          successCount: finishSuccessCount,
          failureCount: finishFailureCount,
          repos: finishRepos,
          durationMs: Date.now() - autoTriggerMs,
          error: viewPrsSchedulerState.lastAutoError || null,
          kind: progressKind,
        },
      });
    }
    if (viewPrsSchedulerState.quickCheckSkippedRepos.size > 0) {
      // See quickCheckSkippedRepos's own comment (near viewPrsSchedulerState's
      // definition) - these specific repos were starved by this exact
      // refresh being in progress, so catch up immediately rather than
      // leaving it to the next periodic tick - scoped to just these repos,
      // not every configured one, since only these were actually skipped.
      // Fire-and-forget, same as the interval-driven caller: this
      // function's own caller (a full sweep's setInterval, or quick-check's
      // own fast-follow) isn't waiting on this.
      const skippedRepos = Array.from(viewPrsSchedulerState.quickCheckSkippedRepos);
      viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
      viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
      void callRunViewPrsQuickCheck({
        repoRequests: skippedRepos.map((repo) => ({ repo })),
      });
    }
  }
};

// Same override-checking pattern as callRunViewPrsScript/callRunViewPrsQuickCheck
// - lets tests monkeypatch module.exports.runViewPrsAutoRefresh before
// createViewPrsApp() so runViewPrsQuickCheck's own fast-follow call (below)
// can be verified without actually running a full refresh.
const callRunViewPrsAutoRefresh = (...args) =>
  (module.exports.runViewPrsAutoRefresh || runViewPrsAutoRefresh)(...args);

// Cheap "did anything change" poll: lists PRs and compares updatedAt against
// the cache, without fetching details/diffs. Runs far more often than the
// full fetch above. Open/draft changes trigger an immediate targeted full
// refresh; closed/merged changes are queued and drained on a longer timer
// by runViewPrsMergedQueueDrain, since they're lower priority.
// Return value is consumed by the manual POST /quick-check route (see
// registerViewPrsMutationRoutes) to report an honest, per-run result -
// the background setInterval caller ignores it, so this is a safe,
// additive contract change. `skipped`/`reposFailed` specifically exist so
// a caller can tell "confirmed nothing changed" apart from "the check
// didn't actually run" (every repo failing used to look identical to a
// clean, all-quiet run - see the CHANGELOG-worthy bug this fixed).
const runViewPrsQuickCheck = async ({
  repo: targetRepo,
  prNumbers,
  repoRequests,
  // As runViewPrsAutoRefresh's.
  progressOrigin = "background",
} = {}) => {
  // Resolved up front (mirroring the same repo-resolution the 3 branches
  // further down each do independently) so a quick check whose entire
  // target set overlaps an in-progress auto refresh OR another in-progress
  // quick check can defer immediately, before emitting a START event -
  // preserving today's single-event "fully blocked" shape. A call whose
  // targets only PARTIALLY overlap falls through to the normal path below,
  // where runQuickCheckForRepo skips just the busy repos instead of the
  // whole call being blocked by an unrelated repo (see
  // autoRefreshInProgressRepos's and quickCheckInProgressRepos's own
  // comments near viewPrsSchedulerState's definition).
  const quickCheckTargetRepos = prNumbers
    ? [targetRepo]
    : Array.isArray(repoRequests) && repoRequests.length > 0
      ? repoRequests.map((entry) => entry.repo)
      : getViewPrsAutoRefreshRepos();
  // Checked in this order (auto-refresh overlap first) because only that
  // reason has a catch-up fast-follow to arm - a repo busy for both reasons
  // at once is classified by whichever it's actually waiting longer on.
  const reposBusyWithAutoRefresh = quickCheckTargetRepos.filter((repo) =>
    viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo),
  );
  const reposBusyWithQuickCheck = quickCheckTargetRepos.filter(
    (repo) =>
      !viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo) &&
      viewPrsSchedulerState.quickCheckInProgressRepos.has(repo),
  );
  const allTargetsBusy =
    quickCheckTargetRepos.length > 0 &&
    reposBusyWithAutoRefresh.length + reposBusyWithQuickCheck.length ===
      quickCheckTargetRepos.length;
  if (allTargetsBusy) {
    viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckSkipReason = "already-in-progress";
    if (reposBusyWithAutoRefresh.length > 0) {
      // Only the auto-refresh-overlap reason gets a catch-up fast-follow -
      // a quick-check-vs-quick-check collision is short-lived and
      // self-resolves (the other call is, itself, a cheap listing pass),
      // unlike waiting out a potentially slow full auto refresh.
      viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = true;
      reposBusyWithAutoRefresh.forEach((repo) =>
        viewPrsSchedulerState.quickCheckSkippedRepos.add(repo),
      );
      callEmitJobEvent({
        job: JOB_NAMES.QUICK_CHECK,
        phase: JOB_PHASES.DEFERRED,
        detail: {
          waitingOn: "autoRefresh",
          reason: "auto-refresh-in-progress",
          willRunAfter: true,
        },
      });
    } else {
      callEmitJobEvent({
        job: JOB_NAMES.QUICK_CHECK,
        phase: JOB_PHASES.SKIPPED,
        detail: { reason: "already-in-progress", willRunAfter: false, origin: progressOrigin, repos: quickCheckTargetRepos },
      });
    }
    return { skipped: true, skipReason: "already-in-progress" };
  }

  const dependencyStatus = callGetDependencyStatus();
  if (!dependencyStatus.ok) {
    viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckSkipReason = `missing dependencies: ${dependencyStatus.missing.join(", ")}`;
    callEmitJobEvent({
      job: JOB_NAMES.QUICK_CHECK,
      phase: JOB_PHASES.SKIPPED,
      detail: {
        reason: "missing-dependencies",
        missing: dependencyStatus.missing,
        willRunAfter: false,
        origin: progressOrigin,
      },
    });
    return { skipped: true, skipReason: "missing-dependencies", missing: dependencyStatus.missing };
  }

  // Per-repo circuit check (same shape as the busy-overlap check above): a
  // repo whose own circuit is open is excluded, but it no longer blocks a
  // DIFFERENT, healthy repo's quick check (see autoCircuitByRepo's own
  // comment near viewPrsSchedulerState's definition).
  const reposPassedBusyFilter = quickCheckTargetRepos.filter(
    (repo) =>
      !reposBusyWithAutoRefresh.includes(repo) &&
      !reposBusyWithQuickCheck.includes(repo),
  );
  const reposWithOpenCircuit = reposPassedBusyFilter.filter(
    (repo) => getViewPrsAutoCircuitOpenState({ nowMs: Date.now(), repo }).isOpen,
  );
  if (
    reposPassedBusyFilter.length > 0 &&
    reposWithOpenCircuit.length === reposPassedBusyFilter.length
  ) {
    viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckSkipReason = "circuit-open";
    callEmitJobEvent({
      job: JOB_NAMES.QUICK_CHECK,
      phase: JOB_PHASES.SKIPPED,
      detail: { reason: "circuit-open", willRunAfter: false, repos: reposWithOpenCircuit, origin: progressOrigin },
    });
    return { skipped: true, skipReason: "circuit-open" };
  }

  // Only the repos actually about to be checked (not the full target list -
  // reposBusyWithAutoRefresh/reposBusyWithQuickCheck/reposWithOpenCircuit
  // are excluded here and, for the first two, get their own per-repo skip
  // inside runQuickCheckForRepo below, same reasoning as that function's
  // own re-check comment: this call may still span several repos processed
  // one at a time, so this Set is what a DIFFERENT concurrent quick check
  // call sees as "busy" for the duration).
  const reposAboutToBeChecked = reposPassedBusyFilter.filter(
    (repo) => !reposWithOpenCircuit.includes(repo),
  );
  reposAboutToBeChecked.forEach((repo) =>
    viewPrsSchedulerState.quickCheckInProgressRepos.add(repo),
  );
  viewPrsSchedulerState.isQuickCheckInProgress = true;
  viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
  viewPrsSchedulerState.lastQuickCheckSkipReason = null;

  const quickCheckStartedMs = Date.now();
  const quickCheckScope = prNumbers
    ? "entered-numbers"
    : Array.isArray(repoRequests) && repoRequests.length > 0
      ? "loaded-prs"
      : "all-repos";
  callEmitJobEvent({
    job: JOB_NAMES.QUICK_CHECK,
    phase: JOB_PHASES.START,
    detail: { scope: quickCheckScope, repos: reposAboutToBeChecked },
  });
  // Repos checked, of this call's.
  const quickCheckTask = startProgressTask({
    kind: "quickCheck",
    origin: progressOrigin,
    repos: reposAboutToBeChecked,
    unit: "repo",
    total: reposAboutToBeChecked.length,
  });
  let finishReposCheckedCount = 0;
  let finishReposFailedCount = 0;
  let finishNewPendingOpenCount = 0;
  let finishNewPendingMergedClosedCount = 0;
  let finishPendingOpenRepos = [];

  try {
    const reposWithPendingOpen = new Set();
    const reposWithNewPendingMergedClosed = new Set();
    const reposChecked = [];
    const reposFailed = [];
    const reposSkippedForAutoRefresh = [];
    let newPendingOpenCount = 0;
    let newPendingMergedClosedCount = 0;

    // `extraArgs` lets the entered-PR-numbers path (below) reuse this same
    // per-repo body with `--quick-check-numbers` appended, bypassing the
    // script's own day-window entirely for those specific numbers - see
    // check-open-pr-updates.sh's --quick-check-numbers flag.
    const runQuickCheckForRepo = async (
      repo,
      extraArgs = [],
      scriptTimeoutMs = viewPrsQuickCheckScriptTimeoutMs,
    ) => {
      // Re-checked per repo, not just once up front: a multi-repo call
      // (repoRequests/"all repos" below) awaits one repo at a time, so
      // autoRefreshInProgressRepos can change between iterations (a refresh
      // starting or finishing) - see that Set's own comment. Skips just
      // this one repo rather than failing it or blocking the whole call.
      if (viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo)) {
        reposSkippedForAutoRefresh.push(repo);
        return;
      }
      // A repo not fetched in full checks just its own PRs, by number -
      // listing it would queue every PR in it. None left to check: done.
      if (!extraArgs.includes("--quick-check-numbers")) {
        const explicitNumbers = getExplicitRefreshNumbers(repo);
        if (explicitNumbers) {
          if (explicitNumbers.length === 0) {
            reposChecked.push(repo);
            return;
          }
          extraArgs = [...extraArgs, "--quick-check-numbers", explicitNumbers.join(",")];
        }
      }
      // The repo's open PRs as GitHub has them now, for the rows (see
      // view-prs-live-summary-helpers.js) - not for a check of entered
      // numbers, which may not be open. A failure keeps the last listing
      // and doesn't fail the check.
      // Open PRs whose review threads changed since their rows were fetched
      // (findPrsWithChangedThreads): queued with the ones the script finds,
      // so the targeted refresh fetches them. And open rows the listing no
      // longer has (findPrsNoLongerOpen): queued as merged/closed changes,
      // as the script's listing of merged PRs may not reach back to when
      // they merged.
      let threadChangedNumbers = [];
      let noLongerOpenNumbers = [];
      if (!extraArgs.includes("--quick-check-numbers") && !isLiveSummaryDisabled()) {
        const liveSummaryResult = await callRefreshRepoLiveSummary(repo);
        if (!liveSummaryResult?.ok) {
          console.warn(
            `[view-prs] live summary failed for ${repo}: ${liveSummaryResult?.error || "unknown error"}`,
          );
        } else {
          try {
            const rawEntries = Object.values(JSON.parse(fs.readFileSync(viewPrsDataFile, "utf8"))?.byPrNumber || {});
            const repoSummary = readLiveSummary().byRepo[repo];
            threadChangedNumbers = findPrsWithChangedThreads(rawEntries, repo, repoSummary);
            // Only a complete listing says which are gone: one cut off at
            // its page limit would read as "none", and forget them all.
            if (repoSummary?.complete === true) {
              noLongerOpenNumbers = takeNoLongerOpenToQueue(repo, findPrsNoLongerOpen(rawEntries, repo, repoSummary));
            }
          } catch (_error) {
            // No data file yet, or unreadable: nothing to compare.
          }
        }
      }
      try {
        const result = await callRunViewPrsScript(
          [viewPrsRunScriptRelativePath, "--quiet", "--quick-check", "--repo", repo, ...extraArgs],
          1024 * 1024,
          { timeoutMs: scriptTimeoutMs, trackSchedulerPrProgress: false, env: getRepoGhEnv(repo) },
        );
        const parsed = JSON.parse(String(result?.stdout || "").trim() || "{}");
        const pendingOpen = [
          ...new Set([...(Array.isArray(parsed.pendingOpen) ? parsed.pendingOpen : []), ...threadChangedNumbers]),
        ];
        const pendingMergedClosed = [
          ...new Set(
            [...(Array.isArray(parsed.pendingMergedClosed) ? parsed.pendingMergedClosed : []), ...noLongerOpenNumbers].map(String),
          ),
        ];

        reposChecked.push(repo);
        newPendingOpenCount += pendingOpen.length;
        newPendingMergedClosedCount += pendingMergedClosed.length;

        // A check of entered numbers settles only those: the ones it found
        // unchanged come off the queue, and the rest of the repo's stay.
        const numbersArgIndex = extraArgs.indexOf("--quick-check-numbers");
        if (numbersArgIndex >= 0) {
          clearPendingNumbersForRepo(
            repo,
            String(extraArgs[numbersArgIndex + 1] || "").split(/[\s,]+/).filter(Boolean),
          );
        }

        if (pendingOpen.length === 0 && pendingMergedClosed.length === 0) {
          // Clear any stale pending flag this repo left behind from an
          // earlier quick check - previously this returned early here
          // without clearing, so a since-resolved repo could keep
          // reporting an old pending count indefinitely.
          if (numbersArgIndex < 0) {
            clearPendingForRepo(repo);
          }
          return;
        }

        setPendingForRepo(repo, { open: pendingOpen, mergedClosed: pendingMergedClosed });
        if (pendingOpen.length > 0) {
          reposWithPendingOpen.add(repo);
        }
        if (pendingMergedClosed.length > 0) {
          reposWithNewPendingMergedClosed.add(repo);
        }
      } catch (repoError) {
        const message = describeFailure(repoError);
        reposFailed.push({ repo, error: message });
        console.warn(`[view-prs] quick-check failed for ${repo}: ${message}`);
      }
    };

    if (prNumbers) {
      // allTargetsBusy and the circuit-open full-skip above would already
      // have fully early-returned if this single target repo were busy or
      // circuit-open, so reaching here means it's free of every skip
      // reason - no extra filtering needed for this one-repo branch.
      await runQuickCheckForRepo(targetRepo, ["--quick-check-numbers", prNumbers]);
      quickCheckTask.advance();
    } else if (Array.isArray(repoRequests) && repoRequests.length > 0) {
      // Sequential, not Promise.all: each repo's own script call already
      // runs up to --jobs `gh pr view` processes concurrently, so checking
      // every repo at once here would multiply that with no cap (e.g. 5
      // repos x 12 jobs = 60 concurrent gh processes). One repo at a time
      // keeps total concurrent load bounded to a single repo's worth.
      //
      // Only pre-filters reposBusyWithQuickCheck/reposWithOpenCircuit here -
      // NOT reposBusyWithAutoRefresh, which deliberately still reaches
      // runQuickCheckForRepo below so ITS OWN live re-check can detect and
      // record it in reposSkippedForAutoRefresh (that reason, unlike these
      // two, can genuinely change mid-loop - see that function's own
      // comment).
      for (const { repo, prNumbers: repoPrNumbers } of repoRequests) {
        if (reposBusyWithQuickCheck.includes(repo) || reposWithOpenCircuit.includes(repo)) {
          continue;
        }
        const extraArgs = ["--jobs", String(viewPrsQuickCheckAllJobs)];
        if (repoPrNumbers) {
          extraArgs.push("--quick-check-numbers", repoPrNumbers);
        }
        await runQuickCheckForRepo(repo, extraArgs, viewPrsQuickCheckAllScriptTimeoutMs);
        quickCheckTask.advance();
      }
    } else {
      // Excludes quickCheck-busy/circuit-open repos up front, but
      // deliberately NOT autoRefresh-busy ones - see the repoRequests
      // branch's own comment just above for why those still need to reach
      // runQuickCheckForRepo so its own live re-check can detect and
      // record them.
      const reposForUnscopedSweep = quickCheckTargetRepos.filter(
        (repo) => !reposBusyWithQuickCheck.includes(repo) && !reposWithOpenCircuit.includes(repo),
      );
      await Promise.all(reposForUnscopedSweep.map((repo) => runQuickCheckForRepo(repo).finally(() => quickCheckTask.advance())));
    }

    viewPrsSchedulerState.lastQuickCheckAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckError = null;
    persistViewPrsSchedulerState();

    // Repos skipped mid-call because that specific repo's auto refresh
    // started/was-still-running when its turn came up (as opposed to the
    // up-front allTargetsBusyWithAutoRefresh case above, which never
    // reaches here at all) - scoped catch-up, same mechanism as that
    // earlier case, just reached via a different path.
    if (reposSkippedForAutoRefresh.length > 0) {
      viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = true;
      reposSkippedForAutoRefresh.forEach((repo) =>
        viewPrsSchedulerState.quickCheckSkippedRepos.add(repo),
      );
      callEmitJobEvent({
        job: JOB_NAMES.QUICK_CHECK,
        phase: JOB_PHASES.DEFERRED,
        detail: {
          waitingOn: "autoRefresh",
          reason: "auto-refresh-in-progress",
          willRunAfter: true,
          repos: reposSkippedForAutoRefresh,
        },
      });
    }

    // Fast-follow via the dispatcher: don't wait for either task type's own
    // next due-time once a change is actually known. Bumping the entry
    // (making it immediately due) and then ticking the dispatcher right
    // away - rather than calling runViewPrsAutoRefresh/runViewPrsMergedQueueDrain
    // directly - keeps the registry as the single source of truth for
    // "is this entry currently running / when did it last run", so the next
    // regular tick doesn't redundantly re-run something this fast-follow
    // just covered.
    //
    // The mergedDrain bump is the fix for a real priority-inversion bug:
    // open-PR changes have always fast-followed immediately, but
    // closed/merged changes previously only sat flagged until
    // mergedQueueDrain's own fixed (and, at the default config, actually
    // *longer* than autoRefresh's) interval - see REACT_MIGRATION_PLAN.md.
    //
    // getOrInitRegistry() first: a manual single-repo/single-PR quick check
    // (from a user-triggered route) can reach here for a repo the
    // dispatcher has never seen yet, with no periodic tick having run to
    // register it - without this, bumpEntryUrgent would silently no-op
    // against a nonexistent entry.
    if (reposWithPendingOpen.size > 0 || reposWithNewPendingMergedClosed.size > 0) {
      callDispatcherHelpers().getOrInitRegistry();
    }
    reposWithPendingOpen.forEach((repo) => {
      callDispatcherHelpers().bumpEntryUrgent(repo, "autoRefresh", {
        reason: "quick-check-pending-open",
      });
    });
    reposWithNewPendingMergedClosed.forEach((repo) => {
      callDispatcherHelpers().bumpEntryUrgent(repo, "mergedDrain", {
        reason: "quick-check-pending-merged-closed",
      });
    });
    if (reposWithPendingOpen.size > 0 || reposWithNewPendingMergedClosed.size > 0) {
      void callRunDispatcherTick();
    }

    finishReposCheckedCount = reposChecked.length;
    finishReposFailedCount = reposFailed.length;
    finishNewPendingOpenCount = newPendingOpenCount;
    finishNewPendingMergedClosedCount = newPendingMergedClosedCount;
    finishPendingOpenRepos = Array.from(reposWithPendingOpen);

    return {
      skipped: false,
      reposChecked,
      reposFailed,
      // Repos this call targeted but didn't actually check because that
      // repo's auto refresh was in progress at the time (see
      // autoRefreshInProgressRepos's own comment) - distinct from
      // reposFailed (which did run but errored). Empty in the common case.
      reposSkippedForAutoRefresh,
      // Repos this call targeted but didn't actually check because a
      // DIFFERENT, concurrently-running quick check call was already
      // covering them (see quickCheckInProgressRepos's own comment).
      // Resolved up front (reposBusyWithQuickCheck), not per-iteration -
      // see reposAboutToBeChecked's own comment for why that's correct
      // here, unlike the auto-refresh-overlap case above.
      reposSkippedForQuickCheckInProgress: reposBusyWithQuickCheck,
      // Repos this call targeted but didn't actually check because that
      // repo's own circuit breaker is currently open (see
      // autoCircuitByRepo's own comment).
      reposSkippedForCircuitOpen: reposWithOpenCircuit,
      newPendingOpenCount,
      newPendingMergedClosedCount,
      // Consumed by initializeScheduler to skip re-refreshing these same
      // repos a second time in its own immediately-following full update -
      // see its own comment for why.
      reposWithPendingOpen: Array.from(reposWithPendingOpen),
    };
  } catch (error) {
    viewPrsSchedulerState.lastQuickCheckError = error?.message || "Quick check failed";
    console.error(`[view-prs] quick check failed: ${viewPrsSchedulerState.lastQuickCheckError}`);
    return { skipped: false, fatalError: viewPrsSchedulerState.lastQuickCheckError };
  } finally {
    // Remove only THIS call's own repos, not the whole Set - a different,
    // concurrently-running quick check call (for different repos) may still
    // have its own entries in it (see quickCheckInProgressRepos's own
    // comment near viewPrsSchedulerState's definition).
    reposAboutToBeChecked.forEach((repo) =>
      viewPrsSchedulerState.quickCheckInProgressRepos.delete(repo),
    );
    viewPrsSchedulerState.isQuickCheckInProgress =
      viewPrsSchedulerState.quickCheckInProgressRepos.size > 0;
    quickCheckTask.finish();
    callEmitJobEvent({
      job: JOB_NAMES.QUICK_CHECK,
      phase: JOB_PHASES.FINISH,
      ok: !viewPrsSchedulerState.lastQuickCheckError,
      detail: {
        reposCheckedCount: finishReposCheckedCount,
        reposFailedCount: finishReposFailedCount,
        newPendingOpenCount: finishNewPendingOpenCount,
        newPendingMergedClosedCount: finishNewPendingMergedClosedCount,
        pendingOpenRepos: finishPendingOpenRepos,
        durationMs: Date.now() - quickCheckStartedMs,
        error: viewPrsSchedulerState.lastQuickCheckError || null,
        repos: reposAboutToBeChecked,
        origin: progressOrigin,
      },
    });
  }
};

// Same override-checking pattern as callRunViewPrsScript/callRunViewPrsShellScript
// - lets tests monkeypatch module.exports.runViewPrsQuickCheck before
// createViewPrsApp() so runViewPrsAutoRefresh's own catch-up call (see its
// finally block) can be verified without actually running a quick check.
const callRunViewPrsQuickCheck = (...args) =>
  (module.exports.runViewPrsQuickCheck || runViewPrsQuickCheck)(...args);

// Batches up closed/merged PRs flagged by the quick-check into a full fetch.
// Runs on a much longer interval than the quick-check itself, and does
// nothing at all when nothing has actually changed (see viewPrsMergedFullSweepIntervalMs).
const runViewPrsMergedQueueDrain = async ({ reposOverride } = {}) => {
  // reposOverride (new): the dispatcher calls this scoped to one repo at a
  // time (see runTaskForEntry) - no manual route calls this function at
  // all, so narrowing to a single repo here has no effect on anything
  // other than the periodic path. A direct call with no args (every
  // existing test, and the pre-dispatcher periodic timer) keeps today's
  // exact behavior: every repo with pending merged/closed changes, minus
  // any also pending-open (that repo's open-PR fast-follow autoRefresh
  // already covers it).
  const candidateRepos = Array.isArray(reposOverride)
    ? reposOverride
    : getReposWithPendingMergedClosed();
  const reposToDrain = candidateRepos.filter(
    (repo) =>
      getReposWithPendingMergedClosed().includes(repo) &&
      !getReposWithPendingOpen().includes(repo),
  );

  viewPrsSchedulerState.lastMergedDrainAt = new Date().toISOString();
  persistViewPrsSchedulerState();

  if (reposToDrain.length === 0) {
    // Not a "blocked" skip - genuinely checked and found nothing to drain,
    // same cadence-wise as a successful run that happened to find nothing.
    // No { skipped: true } here - see runTaskGroup's own comment for why
    // that distinction matters (short retry vs. normal full-interval wait).
    callEmitJobEvent({
      job: JOB_NAMES.MERGED_QUEUE_DRAIN,
      phase: JOB_PHASES.SKIPPED,
      detail: { reason: "nothing-pending" },
    });
    return;
  }

  viewPrsSchedulerState.isMergedDrainInProgress = true;
  const drainStartedMs = Date.now();
  callEmitJobEvent({
    job: JOB_NAMES.MERGED_QUEUE_DRAIN,
    phase: JOB_PHASES.START,
    detail: { repos: reposToDrain, repoCount: reposToDrain.length },
  });
  // Propagate the inner call's own skip signal (e.g. the drained repos'
  // circuit is open, or they're busy with another in-flight auto refresh) -
  // this function has no guard of its own, it relies entirely on
  // runViewPrsAutoRefresh's. Captured outside the try so the finally below
  // can tell a genuine finish from a no-op skip and emit the matching
  // event - otherwise a skip would be followed by a "finish" event implying
  // the drain actually ran, misleading anything (like the Activity drawer)
  // watching the job event stream.
  let innerResult;
  try {
    // Just the queued merged/closed PRs, unless a repo has too many.
    const prNumbersByRepo = {};
    reposToDrain.forEach((repo) => {
      const numbers = getTargetedRefreshNumbers(repo, ["mergedClosed"]);
      if (numbers) prNumbersByRepo[repo] = numbers;
    });
    innerResult = await callRunViewPrsAutoRefresh({ reposOverride: reposToDrain, prNumbersByRepo, progressKind: "mergedQueueDrain" });
  } finally {
    viewPrsSchedulerState.isMergedDrainInProgress = false;
    if (innerResult?.skipped) {
      callEmitJobEvent({
        job: JOB_NAMES.MERGED_QUEUE_DRAIN,
        phase: JOB_PHASES.SKIPPED,
        detail: {
          reason: innerResult.skipReason,
          repos: reposToDrain,
          repoCount: reposToDrain.length,
        },
      });
    } else {
      callEmitJobEvent({
        job: JOB_NAMES.MERGED_QUEUE_DRAIN,
        phase: JOB_PHASES.FINISH,
        detail: {
          repos: reposToDrain,
          repoCount: reposToDrain.length,
          durationMs: Date.now() - drainStartedMs,
        },
      });
    }
  }
  // Always propagate, not just when fully skipped - innerResult now also
  // carries autoRefresh's own per-repo detail (succeededRepos/failedRepos/
  // reposExcludedFor...) even on a run that only PARTIALLY skipped, which
  // runTaskGroup's own resultsByRepo for mergedDrain depends on.
  return innerResult;
};

// Same override-checking pattern as callRunViewPrsAutoRefresh/callRunViewPrsQuickCheck
// - lets tests monkeypatch module.exports.runViewPrsMergedQueueDrain before
// createViewPrsApp() so initializeScheduler's setInterval registration
// (below) can be verified without waiting on a real timer/drain.
const callRunViewPrsMergedQueueDrain = (...args) =>
  (module.exports.runViewPrsMergedQueueDrain || runViewPrsMergedQueueDrain)(...args);

// Runs every due entry of ONE task type together, in a single call -
// never one call per repo. This matters beyond efficiency: runViewPrsQuickCheck/
// runViewPrsAutoRefresh are single-flight by design (their own
// isQuickCheckInProgress/isAutoRunInProgress guards assume at most one call
// of that function runs at a time, process-wide) - calling either of them
// twice concurrently (once per repo) would make the second call's guard
// trip and silently skip, exactly the kind of "known work silently
// dropped" bug this whole feature exists to close. Each function already
// accepts multiple repos in one call (reposOverride/repoRequests), which is
// the existing, safe way to cover several due repos of the same task type
// at once - see view-prs-dispatcher-helpers.js for the per-repo
// priority/budget selection this group is built from.
// Builds a { [repo]: {skipped,skipReason} | {ok,error} } map for every repo
// in the group - a shared, uniform outcome across the whole batch (the
// pre-existing shape) silently mis-records any repo a job function's own
// PARTIAL skip filtered out of a multi-repo call: that repo never actually
// ran, but without per-repo detail it inherits whatever the REST of the
// batch did. See the plan this closes: a repo excluded by an
// already-in-progress/circuit-open overlap with just SOME of a batch's
// repos used to get marked ok:true anyway once a different repo in the
// same batch genuinely succeeded.
const buildUniformResultsByRepo = (repos, outcome) =>
  Object.fromEntries(repos.map((repo) => [repo, outcome]));

// A repo with more PRs queued than this gets its full refresh instead: a
// run of chosen PRs looks each one up on its own, where a full refresh
// lists them, and past a point the listing is cheaper.
const MAX_TARGETED_REFRESH_PRS = 25;

// The repo's queued PR numbers of these kinds ("open", "mergedClosed") to
// refresh on their own, or null for a full refresh (none queued, or too
// many).
const getTargetedRefreshNumbers = (repo, kinds) => {
  const pending = getPendingForRepo(repo);
  const numbers = [...new Set(kinds.flatMap((kind) => pending[kind] || []).map(String))];
  return numbers.length > 0 && numbers.length <= MAX_TARGETED_REFRESH_PRS ? numbers : null;
};

const runTaskGroup = async (taskType, entries) => {
  const repos = entries.map((entry) => entry.repo);

  if (taskType === "quickCheck") {
    const result = await callRunViewPrsQuickCheck({
      repoRequests: repos.map((repo) => ({ repo })),
    });
    if (result?.skipped) {
      return {
        resultsByRepo: buildUniformResultsByRepo(repos, {
          skipped: true,
          skipReason: result.skipReason,
        }),
      };
    }
    if (result?.fatalError) {
      // Thrown before any individual repo's own result was known - no
      // finer-grained info than the shared error.
      return {
        resultsByRepo: buildUniformResultsByRepo(repos, {
          ok: false,
          error: result.fatalError,
        }),
      };
    }
    const resultsByRepo = {};
    (result?.reposChecked || []).forEach((repo) => {
      resultsByRepo[repo] = { ok: true, error: null };
    });
    (result?.reposFailed || []).forEach(({ repo, error }) => {
      resultsByRepo[repo] = { ok: false, error };
    });
    (result?.reposSkippedForAutoRefresh || []).forEach((repo) => {
      resultsByRepo[repo] = { skipped: true, skipReason: "already-in-progress" };
    });
    (result?.reposSkippedForQuickCheckInProgress || []).forEach((repo) => {
      resultsByRepo[repo] = { skipped: true, skipReason: "already-in-progress" };
    });
    (result?.reposSkippedForCircuitOpen || []).forEach((repo) => {
      resultsByRepo[repo] = { skipped: true, skipReason: "circuit-open" };
    });
    // Defensive fallback (see the autoRefresh/mergedDrain branch's own
    // comment below for why this matters) - every repo here SHOULD already
    // be accounted for by one of the arrays above, but defaulting to a
    // success protects against ever turning an unrecognized gap into a
    // false failure.
    repos.forEach((repo) => {
      if (!resultsByRepo[repo]) {
        resultsByRepo[repo] = { ok: true, error: null };
      }
    });
    return { resultsByRepo };
  }

  // An auto refresh due only because a quick check found PRs changed (its
  // full sweep isn't due yet) refreshes just those PRs - open and merged/
  // closed alike - and keeps the sweep's time (keepSchedule below).
  // Otherwise it's the full sweep.
  // A fast-follow whose queue emptied before it ran (a manual run refreshed
  // the repo, say) has nothing to do: done, keeping the sweep's time.
  const prNumbersByRepo = {};
  const nothingLeftRepos = [];
  if (taskType === "autoRefresh") {
    entries.forEach((entry) => {
      if (!callDispatcherHelpers().isBumpedOnlyFor(entry, "quick-check-pending-open")) return;
      const pending = getPendingForRepo(entry.repo);
      if (pending.open.length === 0 && pending.mergedClosed.length === 0) {
        nothingLeftRepos.push(entry.repo);
        return;
      }
      const numbers = getTargetedRefreshNumbers(entry.repo, ["open", "mergedClosed"]);
      if (numbers) prNumbersByRepo[entry.repo] = numbers;
    });
  }
  const nothingLeftResults = Object.fromEntries(
    nothingLeftRepos.map((repo) => [repo, { ok: true, error: null, keepSchedule: true }]),
  );
  const reposToRun = repos.filter((repo) => !nothingLeftRepos.includes(repo));
  if (reposToRun.length === 0) {
    return { resultsByRepo: nothingLeftResults };
  }
  const result =
    taskType === "autoRefresh"
      ? await callRunViewPrsAutoRefresh({
          reposOverride: reposToRun,
          prNumbersByRepo,
          // Every repo only for its changed PRs: that's what it is.
          ...(reposToRun.every((repo) => prNumbersByRepo[repo]) ? { progressKind: "changedPrs" } : {}),
        })
      : await callRunViewPrsMergedQueueDrain({ reposOverride: reposToRun });
  if (result?.skipped) {
    return {
      resultsByRepo: {
        ...nothingLeftResults,
        ...buildUniformResultsByRepo(reposToRun, {
          skipped: true,
          skipReason: result.skipReason,
        }),
      },
    };
  }
  const resultsByRepo = { ...nothingLeftResults };
  const targetedRepos = new Set(result?.targetedRepos || []);
  (result?.succeededRepos || []).forEach((repo) => {
    resultsByRepo[repo] = {
      ok: true,
      error: null,
      // Only the auto refresh's fast-follow keeps a schedule; the drain
      // runs only when something's queued, so its next time is as usual.
      ...(taskType === "autoRefresh" && targetedRepos.has(repo) ? { keepSchedule: true } : {}),
    };
  });
  (result?.failedRepos || []).forEach((repo) => {
    resultsByRepo[repo] = {
      ok: false,
      error: result?.failedRepoErrors?.[repo] || result?.error || null,
    };
  });
  (result?.reposExcludedForAlreadyInProgress || []).forEach((repo) => {
    resultsByRepo[repo] = { skipped: true, skipReason: "already-in-progress" };
  });
  (result?.reposExcludedForCircuitOpen || []).forEach((repo) => {
    resultsByRepo[repo] = { skipped: true, skipReason: "circuit-open" };
  });
  (result?.reposExcludedForManualCooldown || []).forEach((repo) => {
    resultsByRepo[repo] = { skipped: true, skipReason: "manual-cooldown" };
  });
  // Any repo in THIS group not otherwise accounted for defaults to a
  // genuine success, not a failure - covers mergedDrain's own
  // "nothing-pending" early return (bare `return;`, no result object at
  // all: a routine "checked, nothing to do", deliberately not a skip - see
  // that function's own comment) and any other call shape that doesn't
  // (yet) report every repo explicitly. Without this, an unaccounted-for
  // repo would otherwise fall through to executeTaskTypeGroup's own
  // "No per-repo result reported" fallback, which is a FAILURE outcome -
  // appropriate for a truly unexpected gap, wrong for an expected one.
  repos.forEach((repo) => {
    if (!resultsByRepo[repo]) {
      resultsByRepo[repo] = { ok: true, error: null };
    }
  });
  return { resultsByRepo };
};

// Runs one task-type group's call (runTaskGroup) and records the outcome
// back onto every entry in it, fully independently of the claim phase below
// - this is the part that's allowed to take a while (real `gh` calls in
// production) without holding up the next tick.
const executeTaskTypeGroup = async (dispatcher, taskType, entries) => {
  try {
    const { resultsByRepo } = await runTaskGroup(taskType, entries);
    const finishedAtMs = Date.now();
    entries.forEach((entry) => {
      // Falls back to a genuine failure, not a silent "ok:true", if a repo
      // somehow has no entry at all in resultsByRepo - the whole point of
      // this per-repo map is that nothing should fall through unnoticed.
      const result = resultsByRepo?.[entry.repo] || {
        ok: false,
        error: "No per-repo result reported for this entry",
      };
      if (result.skipped) {
        dispatcher.markEntryDeferred(entry, {
          nowMs: finishedAtMs,
          skipReason: result.skipReason,
        });
      } else {
        dispatcher.markEntryFinished(entry, {
          nowMs: finishedAtMs,
          ok: result.ok,
          error: result.error,
          keepSchedule: result.keepSchedule === true,
        });
      }
    });
  } catch (error) {
    const finishedAtMs = Date.now();
    entries.forEach((entry) =>
      dispatcher.markEntryFinished(entry, {
        nowMs: finishedAtMs,
        ok: false,
        error: describeFailure(error),
      }),
    );
  }
};

// The dispatcher's single periodic driver, replacing the three independent
// setIntervals below it (see REACT_MIGRATION_PLAN.md's dispatcher plan).
// Picks every entry that's both due and affordable within the shared
// gh-process budget (manual routes' own reserveGhSlots calls - see
// view-prs-mutation-routes.js - count against the same budget, so the
// background dispatcher throttles around manual work without ever making
// a manual action wait), groups them by task type (see runTaskGroup for
// why), and kicks off each group's execution without waiting for it.
//
// Claim phase vs. execution phase: everything up through marking every
// selected entry `isRunning` is synchronous (no `await`), so two
// back-to-back invocations of this function can never interleave mid-claim
// - by the time either call's synchronous prefix yields control back to the
// event loop, every entry it selected is already marked running, so the
// other invocation's own pickNextBatch (which filters on !isRunning)
// correctly excludes them. isDispatcherTickInFlight is kept as a cheap,
// defensive guard around just this claim phase anyway (documents the
// invariant, costs nothing) - but it's released BEFORE any group's
// execution starts, not after every group finishes. This is what lets a
// newly-due quickCheck (e.g. for an unrelated repo) get claimed and run by
// the very next periodic tick while a previous tick's slow, multi-repo
// autoRefresh group is still executing in the background - previously the
// whole tick (every selected group, run sequentially) had to finish before
// isDispatcherTickInFlight released and a new tick could even look.
// quickCheck's group no longer needs to run sequentially relative to the
// others: that was only to avoid tripping its old *global*
// isAutoRunInProgress guard, now per-repo (see autoRefreshInProgressRepos).
// autoRefresh and mergedDrain still run sequentially RELATIVE TO EACH
// OTHER (not to quickCheck, and not blocking this tick's own return) - see
// their own sequencing comment further down, where groupsByTaskType is
// split up.
let isDispatcherTickInFlight = false;

const runDispatcherTick = async () => {
  if (isDispatcherTickInFlight) {
    return;
  }
  isDispatcherTickInFlight = true;
  let selected;
  let dispatcher;
  try {
    dispatcher = callDispatcherHelpers();
    dispatcher.getOrInitRegistry();
    const nowMs = Date.now();
    const availableGhSlots = Math.max(
      0,
      effectiveDispatcherGhProcessBudget -
        dispatcher.getReservedGhSlots() -
        dispatcher.getRunningGhCost(),
    );
    ({ selected } = dispatcher.pickNextBatch({ nowMs, availableGhSlots }));
    if (selected.length === 0) {
      return;
    }

    const startedAtMs = Date.now();
    selected.forEach((entry) => dispatcher.markEntryRunning(entry, { nowMs: startedAtMs }));
  } finally {
    isDispatcherTickInFlight = false;
  }

  const groupsByTaskType = new Map();
  selected.forEach((entry) => {
    if (!groupsByTaskType.has(entry.taskType)) {
      groupsByTaskType.set(entry.taskType, []);
    }
    groupsByTaskType.get(entry.taskType).push(entry);
  });

  // quickCheck is fully decoupled - its own guard is per-repo now (see
  // autoRefreshInProgressRepos), so it never needs to wait on the other two.
  const quickCheckGroup = groupsByTaskType.get("quickCheck");
  if (quickCheckGroup) {
    void executeTaskTypeGroup(dispatcher, "quickCheck", quickCheckGroup);
  }

  // autoRefresh and mergedDrain are NOT independent the same way:
  // runViewPrsMergedQueueDrain calls callRunViewPrsAutoRefresh internally
  // (to refresh the repos it just drained), sharing runViewPrsAutoRefresh's
  // own single-flight isAutoRunInProgress guard - which stays global/
  // unchanged by design (see autoRefreshInProgressRepos's own comment:
  // only the cross-task quickCheck-vs-autoRefresh guard became per-repo).
  // Firing both groups fire-and-forget independently here would let one
  // group's direct autoRefresh call (e.g. for repo A) trip while the
  // OTHER group's internal autoRefresh call (e.g. mergedDrain refreshing
  // repo B after draining it) is concurrently starting - both paths hit
  // the very first line of runViewPrsAutoRefresh synchronously, before
  // either yields control, so whichever started first wins the guard and
  // the other silently defers. Sequencing these two relative to EACH
  // OTHER (not to quickCheck, and not to this tick's own return) restores
  // the guarantee the old fully-sequential tick gave them for free.
  const autoRefreshGroup = groupsByTaskType.get("autoRefresh");
  const mergedDrainGroup = groupsByTaskType.get("mergedDrain");
  if (autoRefreshGroup || mergedDrainGroup) {
    void (async () => {
      if (autoRefreshGroup) {
        await executeTaskTypeGroup(dispatcher, "autoRefresh", autoRefreshGroup);
      }
      if (mergedDrainGroup) {
        await executeTaskTypeGroup(dispatcher, "mergedDrain", mergedDrainGroup);
      }
    })();
  }
};

// Same override-checking pattern as every other call site in this file -
// lets the two urgency-bump call sites above (in runViewPrsQuickCheck) and
// initializeScheduler's own setInterval be verified without waiting on a
// real timer.
const callRunDispatcherTick = (...args) =>
  (module.exports.runDispatcherTick || runDispatcherTick)(...args);

// Manual "run this sooner" reprioritization from the Activity drawer (see
// REACT_MIGRATION_PLAN.md's dispatcher plan) - the exact same
// bump-then-tick mechanism the two automatic fast-follow call sites above
// already use, just triggered by a person instead of a quick-check result.
// getOrInitRegistry() first for the same reason the fast-follow call sites
// need it: the target entry might not exist yet if no tick has run since
// this repo was added. Fire-and-forget on the tick, same as every other
// bump call site - the caller doesn't wait on the actual task to finish.
//
// Returns { entry, applied } rather than just the entry: `applied` is false
// when the entry was already "due" or "running" *before* this call, so the
// bump had no real effect (nextDueAt was already <= now, or it's mid-flight)
// - without this, the route would report ok:true for a no-op bump with no
// way for the caller to tell the difference from a real reprioritization.
const bumpDispatcherEntry = (repo, taskType, opts) => {
  callDispatcherHelpers().getOrInitRegistry();
  const previousStatus = callDispatcherHelpers()
    .getDispatcherQueueSnapshot({ limit: Infinity })
    .find((item) => item.repo === repo && item.taskType === taskType)?.status;
  const entry = callDispatcherHelpers().bumpEntryUrgent(repo, taskType, opts);
  if (!entry) {
    return null;
  }
  void callRunDispatcherTick();
  return { entry, applied: previousStatus !== "due" && previousStatus !== "running" };
};

// Manual "Reset circuit breaker" action from the Activity drawer - plain
// resetAutoCircuitBreaker (view-prs-scheduler-helpers.js) only clears the
// breaker's own bookkeeping, it doesn't touch the dispatcher at all. Left
// alone, the affected repo's dispatcher entries could still be up to a
// full task interval away from their next natural attempt (silently
// pushed out earlier by runTaskGroup's unconditional "ok:true" on what was
// actually a silent circuit-open no-op) - defeating the whole point of a
// manual "try again now" action. Reuses the exact bump-then-tick mechanism
// bumpDispatcherEntry above already uses, applied to every task type for
// each affected repo (a circuit-open repo blocks quickCheck too, not just
// autoRefresh/mergedDrain - see getDueEntries's own comment in
// view-prs-dispatcher-helpers.js).
const resetAutoCircuitBreakerAndRetry = (opts = {}) => {
  // Snapshot BEFORE resetting - getOpenAutoCircuitRepos() would already be
  // empty by the time resetAutoCircuitBreaker returns.
  const reposToRetry = opts.repo
    ? [opts.repo]
    : Array.isArray(opts.repos)
      ? opts.repos
      : getOpenAutoCircuitRepos();
  const result = resetAutoCircuitBreaker(opts);
  if (reposToRetry.length > 0) {
    callDispatcherHelpers().getOrInitRegistry();
    reposToRetry.forEach((repo) => {
      DISPATCHER_TASK_TYPES.forEach((taskType) => {
        callDispatcherHelpers().bumpEntryUrgent(repo, taskType, {
          reason: "circuit-breaker-reset",
        });
      });
    });
    void callRunDispatcherTick();
  }
  return result;
};

// Vite dev middleware (React/JSX transform)
//
// index.html loads react-app.tsx as an ES module. Express can't transpile
// JSX or resolve bare module specifiers on its own, so outside of a
// production build we embed Vite's dev server in middleware mode and let it
// handle those requests before falling back to static files / API routes.
const isProductionEnv = process.env.NODE_ENV === "production";
// This app is mounted at /view-prs by the root server (index.js), but Vite
// needs to know that prefix too: it uses `base` to emit browser-facing URLs
// for its client script, HMR, and resolved imports (/@vite/client, /@fs/...,
// /components/PrTableApp.tsx, etc). Without it those come back rooted at
// "/" and 404 once the browser requests them.
const VIEW_PRS_MOUNT_PATH = "/view-prs";
let viteDevServerPromise = null;

const getViteDevServer = () => {
  if (!viteDevServerPromise) {
    viteDevServerPromise = (async () => {
      const { createServer: createViteDevServer } = require("vite");
      const react = require("@vitejs/plugin-react");
      return createViteDevServer({
        // Deliberately skip vite.config.js: it configures the *standalone*
        // dev server (port 3456) with a proxy that forwards /view-prs
        // requests to this very server on :9000. Merging that in here would
        // make this embedded instance proxy every request back to itself.
        configFile: false,
        root: viewPrsUiDir,
        base: `${VIEW_PRS_MOUNT_PATH}/`,
        appType: "custom",
        plugins: [react()],
        resolve: {
          alias: {
            "@": viewPrsUiDir,
            "@helpers": path.join(viewPrsUiDir, "helpers"),
            "@components": path.join(viewPrsUiDir, "components"),
          },
        },
        server: { middlewareMode: true },
      });
    })().catch((error) => {
      viteDevServerPromise = null;
      throw error;
    });
  }
  return viteDevServerPromise;
};

// Create and configure the Express app. `production` (NODE_ENV=production by
// default) serves the built UI from dist/ui instead of transforming src/ui
// through Vite: index.html loads react-app.tsx, which a browser can't run
// untransformed.
const createViewPrsApp = ({ production = isProductionEnv } = {}) => {
  const app = express();

  // Only the dashboard's own pages may use it through a browser (see
  // request-origin-guard.js); any Host once VIEW_PRS_HOST opens it to the
  // network (server.js).
  app.use(
    createRequestOriginGuard({
      allowAnyHost: !isLoopbackHostname(String(process.env.VIEW_PRS_HOST || "").trim() || "127.0.0.1"),
    }),
  );
  // JSON bodies only: a form any site can post (urlencoded) isn't parsed.
  app.use(express.json());

  if (!production) {
    app.use((req, res, next) => {
      getViteDevServer()
        .then((vite) => {
          // Express strips the /view-prs mount prefix from req.url before
          // handing control to this sub-app's middleware, but Vite (configured
          // with base "/view-prs/" above) expects to see that prefix so it can
          // recognize and match its own special paths. Restore it just for
          // Vite's turn, then put back the stripped url for downstream routes
          // (the data/mutation API routes registered below all expect it).
          const strippedUrl = req.url;
          req.url = VIEW_PRS_MOUNT_PATH + strippedUrl;
          vite.middlewares(req, res, (err) => {
            req.url = strippedUrl;
            next(err);
          });
        })
        .catch((error) => {
          console.error(
            "[view-prs] Vite dev middleware unavailable, falling back to static files:",
            error,
          );
          next();
        });
    });
  }

  if (production) {
    // The build first; src/ui after it for what the build doesn't copy (the
    // vendored marked and DOMPurify scripts index.html loads as plain
    // <script>s).
    app.use(express.static(viewPrsUiBuildDir, { index: false }));
  }
  app.use(express.static(viewPrsUiDir, { index: false }));

  // Initialize user-defaults file on startup if it doesn't exist
  initUserDefaultsFile();

  // Favicon route
  const faviconFile = path.join(viewPrsDir, "favicon.png");
  app.get(["/favicon.ico", "/favicon.png"], (_req, res) => {
    if (!fs.existsSync(faviconFile)) {
      res.status(404).send("Favicon not found");
      return;
    }

    res.sendFile(faviconFile, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  });

  // That this server is running, and its data folder - npm run data:move
  // asks, and won't move the folder from under it. Cheap: no checks, no
  // action log entry.
  app.get("/health", (_req, res) => {
    res.json({ app: "view-prs", dataDir: viewPrsDataDir });
  });

  // Dependency health route - README's own "Troubleshooting" section
  // already documents `curl -s http://localhost:9000/health/deps` as the
  // way to check this, but the route itself was never implemented; wires
  // it up now, reusing the same getDependencyStatus() the scheduler
  // already calls internally before attempting an auto-refresh.
  app.get("/health/deps", (_req, res) => {
    // Matches the override-checking pattern every other internal call site
    // for this function already uses (see runViewPrsScript/getDependencyStatus
    // usage above) - lets tests monkeypatch module.exports.getDependencyStatus
    // before createViewPrsApp() without needing a real shell/PATH.
    const status = (module.exports.getDependencyStatus || getDependencyStatus)();
    // ghAuthenticated is intentionally NOT part of getDependencyStatus()
    // itself (see isGhAuthenticated's own comment) - it's a real GitHub API
    // call, only worth making for this on-demand route, not the
    // scheduler's per-attempt pre-flight check. null means "gh isn't
    // installed, so there's nothing to check" - distinct from `false`
    // (installed but not logged in).
    const ghAuthenticated = (module.exports.isGhAuthenticated || isGhAuthenticated)();
    const fullStatus = {
      ...status,
      ghAuthenticated,
      ok: status.ok && ghAuthenticated !== false,
    };
    if (ghAuthenticated === false && !fullStatus.missing.includes("gh:auth")) {
      fullStatus.missing = [...fullStatus.missing, "gh:auth"];
    }
    res.status(fullStatus.ok ? 200 : 503).json(fullStatus);
  });

  // Legacy compatibility route for UI files
  app.get(["/", "/index.html"], async (req, res) => {
    if (production) {
      if (fs.existsSync(viewPrsUiBuildIndexFile)) {
        res.sendFile(viewPrsUiBuildIndexFile);
      } else {
        res
          .status(503)
          .type("text/plain")
          .send(
            "The UI hasn't been built. Run `npm run build:ui`, then restart; or start without NODE_ENV=production to serve it through Vite.",
          );
      }
      return;
    }

    try {
      const vite = await getViteDevServer();
      const rawHtml = fs.readFileSync(viewPrsUiIndexFile, "utf-8");
      const transformedHtml = await vite.transformIndexHtml(
        req.originalUrl,
        rawHtml,
      );
      res.status(200).set({ "Content-Type": "text/html" }).end(transformedHtml);
    } catch (error) {
      console.error(
        "[view-prs] Vite HTML transform failed, serving raw index.html:",
        error,
      );
      res.sendFile(viewPrsUiIndexFile);
    }
  });

  registerViewPrsMutationRoutes({
    app,
    startProgressTask,
    countFinishedPrs,
    viewPrsRunScriptRelativePath,
    callGetDependencyStatus,
    callRunViewPrsScript,
    viewPrsManualScriptTimeoutMs,
    viewPrsAckScriptTimeoutMs,
    viewPrsAckRefreshScriptTimeoutMs,
    viewPrsAckTotalRefreshTimeoutMs,
    defaultViewPrsRepo,
    setLastManualRunNow,
    subscribeRepoToRecent,
    clearPendingForRepo,
    clearPendingNumbersForRepo,
    appendActionLogEntry,
    // Without hidden repos' rows (filterToVisibleRows).
    readViewPrsData: readVisibleViewPrsData,
    enqueuePrDiffRefreshForData,
    formatScriptFailureMessage,
    viewPrsSchedulerState,
    resetViewPrsAutoRefreshFailureState,
    resetAutoCircuitBreaker,
    getViewPrsAutoRefreshRepos,
    runViewPrsAutoRefresh,
    runViewPrsQuickCheck,
    buildAckRefreshBudgetSkipErrors,
    isRepoSlug,
    listMergedPrCandidates,
    listRepoLabels,
    applyLabelToPr,
    fetchGithubPrLabels,
    patchStoredPrLabels,
    emitDataChanged: callEmitDataChanged,
    // Non-blocking budget reservation (see view-prs-dispatcher-helpers.js) -
    // manual routes never wait on the dispatcher's own gh-process budget,
    // they just occupy a slot of it for their own duration so the
    // background dispatcher's next tick sees fewer availableGhSlots while a
    // manual action is in flight.
    reserveGhSlots: (...args) => callDispatcherHelpers().reserveGhSlots(...args),
    releaseGhSlots: (...args) => callDispatcherHelpers().releaseGhSlots(...args),
    // /run-auto is the one manual route that triggers runViewPrsAutoRefresh
    // with no repo scope, fanning out across up to viewPrsPrDiffConcurrency
    // repos *in parallel* (the same multi-repo worker pool the dispatcher's
    // own autoRefresh entries use) - every other manual route is a single
    // script/gh invocation, correctly represented by the default
    // reservation of 1. Reusing the dispatcher's own autoRefresh cost
    // estimate keeps this consistent with how the dispatcher accounts for
    // that same kind of work, rather than a second, disconnected guess.
    runAutoGhReservationCost: dispatcherGhCostByTaskType.autoRefresh,
    getRepoGhEnv,
    trackRunPrs,
    // A manual run of chosen PRs fetched them: none is unreachable now.
    recordFetchedPrs: (repo, numbers) => recordUnreachablePrs(repo, numbers, []),
    // Every row shows: before the sources are seeded, or a repo fetched in full.
    showsAllRowsOfRepo: (repo) => {
      const visibility = getRowVisibility();
      return !visibility || visibility.repos.has(repo);
    },
  });

  registerViewPrsSourcesRoutes({
    app,
    sourcesStorage: viewPrsSourcesStorage,
    seedSubscriptionRepos,
    verifyGithubPr: (...args) => (module.exports.verifyGithubPr || verifyGithubPr)(...args),
    runViewPrsAutoRefresh: (...args) => callRunViewPrsAutoRefresh(...args),
    isRepoRefreshing: (repo) => viewPrsSchedulerState.autoRefreshInProgressRepos.has(repo),
    emitDataChanged: callEmitDataChanged,
    getSourcesForPage,
    console,
  });

  registerViewPrsPrRoutes({
    app,
    normalizeNotes,
    normalizeAuthorComment,
    normalizeAuthorCommentSentiment,
    fs,
    viewPrsDataFile,
    viewPrsAuthorCommentsFile,
    normalizeViewPrsUserState,
    normalizeViewPrsAuthorComments,
    readJsonFileIfExists,
    viewPrsUserStateFile,
    writeViewPrsUserState,
    updateViewPrsUserState,
    readViewPrsAuthorComments,
    writeViewPrsAuthorComments,
    appendActionLogEntry,
    // Without hidden repos' rows (filterToVisibleRows).
    readViewPrsData: readVisibleViewPrsData,
    resolveActorKey: resolveViewPrsActorKey,
    isRepoSlug,
    syncPrDiffForEntry,
    runInsightsHookScript: callRunInsightsHookScript,
    readViewPrsPrDetails,
  });

  registerViewPrsDataRoutes({
    app,
    isObject,
    readUserDefaults,
    writeUserDefaults,
    getViewPrsBackfillPublicState,
    // Without hidden repos' rows (filterToVisibleRows).
    readViewPrsData: readVisibleViewPrsData,
    enqueuePrDiffRefreshForData,
    getViewPrsDataMeta,
    getViewPrsDataManifest,
    getViewPrsSchedulerPublicState,
    actorsStorage,
    viewPrsBackfillLogFile,
    viewPrsBackfillPidFile,
    bumpDispatcherEntry,
    dispatcherTaskTypes: DISPATCHER_TASK_TYPES,
    getDispatcherSettings: () => callDispatcherHelpers().getRepoSettingsDefaults(),
    resetAutoCircuitBreaker: resetAutoCircuitBreakerAndRetry,
    emitSchedulerStateChanged: callEmitSchedulerStateChanged,
  });

  registerViewPrsBackfillRoutes({
    app,
    appendActionLogEntry,
    getViewPrsBackfillPublicState,
    getBackfillLogTail,
    parseBackfillCommandOutput,
    runViewPrsBackfillAction,
    formatScriptFailureMessage,
    viewPrsBackfillLogFile,
    viewPrsBackfillPidFile,
    viewPrsBackfillManagerRelativePath,
    readActionLog,
  });

  registerViewPrsEventsRoutes({
    app,
    subscribeToJobEvents,
    getJobEventsSubscriberCount,
    getViewPrsSchedulerPublicState,
    console,
    heartbeatIntervalMs: viewPrsEventsHeartbeatIntervalMs,
    maxClients: viewPrsEventsMaxClients,
    getDataVersion: () => (module.exports.getViewPrsDataVersion || getViewPrsDataVersion)(),
    emitDataChanged: callEmitDataChanged,
    dataWatchIntervalMs: viewPrsEventsDataWatchIntervalMs,
  });

  return app;
};

// Migrates today's flat { lastManualRunAt, lastAutoRunAt, lastQuickCheckAt,
// lastMergedDrainAt, pendingByRepo } persisted shape into the dispatcher's
// per-(repo, taskType) registry the first time it's loaded after upgrading -
// readViewPrsSchedulerState itself only does a plain data copy when the
// persisted file already has the new shape (dispatcherVersion: 2); it
// deliberately does NOT call into dispatcherHelpers (that would create a
// circular dependency between the two helper factories, since
// dispatcherHelpers itself depends on getViewPrsAutoRefreshRepos from
// createViewPrsSchedulerHelpers) - so this one-time migration glue lives
// here instead, in the orchestration layer that already constructs both.
const migrateDispatcherStateIfNeeded = () => {
  if (viewPrsSchedulerState.dispatcher) {
    return;
  }
  const legacyShape = {
    lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
    lastAutoRunAt: viewPrsSchedulerState.lastAutoRunAt,
    lastQuickCheckAt: viewPrsSchedulerState.lastQuickCheckAt,
    lastMergedDrainAt: viewPrsSchedulerState.lastMergedDrainAt,
    pendingByRepo: viewPrsSchedulerState.pendingByRepo,
  };
  const { entries, pendingByRepo } = callDispatcherHelpers().migrateLegacyPersistedState(
    legacyShape,
    { repos: getViewPrsAutoRefreshRepos(), nowMs: Date.now() },
  );
  viewPrsSchedulerState.dispatcher = { entries, reservedGhSlots: 0 };
  viewPrsSchedulerState.pendingByRepo = pendingByRepo;
  persistViewPrsSchedulerState();
};

// Scheduler management functions for external use
const initializeScheduler = () => {
  readViewPrsSchedulerState();
  migrateDispatcherStateIfNeeded();
  // getOrInitRegistry's own job (beyond the one-time migration above):
  // register any repo newly discovered since the persisted file was last
  // written, and refresh every entry's priority/interval from the current
  // schedulerRepoConfig - safe/cheap to call once here even before the
  // dispatcher is wired into the live tick (next step).
  callDispatcherHelpers().getOrInitRegistry();
  // No bespoke "check everything once" startup burst needed anymore: every
  // registry entry defaults to immediately-due on a fresh install, and any
  // entry restored from a migrated/existing persisted file keeps whatever
  // real nextDueAt its own run history already implies - so the very first
  // dispatch tick below naturally reproduces "check everything once at
  // startup" through the same generic mechanism every later tick uses,
  // without the old dedicated code path's risk of double-checking a repo
  // (that code existed specifically to avoid running autoRefresh twice for
  // the same repo across its two startup passes - moot now, since
  // autoRefresh-for-a-repo is one registry entry that pickNextBatch can
  // only select once per tick).
  //
  // Not awaited here - initializeScheduler's own callers (server.js) don't
  // wait on startup work finishing.
  void callRunDispatcherTick();
  // Wrapped in an arrow function (rather than passing the bare function
  // reference) so each tick re-checks module.exports.runDispatcherTick
  // fresh, same as every other overridable call site in this file - a bare
  // reference here would permanently bind to whichever function was in
  // scope when initializeScheduler ran, making it un-mockable by tests that
  // monkeypatch module.exports.runDispatcherTick afterward.
  return setInterval(() => callRunDispatcherTick(), viewPrsDispatcherTickIntervalMs);
};

module.exports = {
  // Main app and scheduler
  createViewPrsApp,
  initializeScheduler,
  // Overridable by tests (see the sources routes' registration).
  verifyGithubPr,
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
  runViewPrsMergedQueueDrain,
  runDispatcherTick,
  emitJobEvent,
  emitSchedulerStateChanged,
  emitDataChanged,
  subscribeToJobEvents,
  getJobEventsSubscriberCount,
  dispatcherHelpers,
  // Core config/constants
  viewPrsDir,
  viewPrsUiIndexFile,
  viewPrsRunScriptRelativePath,
  viewPrsBackfillManagerRelativePath,
  viewPrsSchedulerFile,
  viewPrsLegacySchedulerFile,
  viewPrsDataFile,
  viewPrsPrDetailDir,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  viewPrsBackupDir,
  viewPrsBackupRetention,
  viewPrsActorNameCacheFile,
  viewPrsActorLoginAliasesFile,
  viewPrsActorsFile,
  viewPrsDataDir,
  viewPrsBackfillManagerScript,
  viewPrsActionLogFile,
  viewPrsBackfillPidFile,
  viewPrsBackfillLogFile,
  viewPrsUserDefaultsFile,
  viewPrsPrDiffDir,
  appendActionLogEntry,
  readActionLog,
  viewPrsAutoIntervalMs,
  viewPrsManualCooldownMs,
  viewPrsQuickCheckIntervalMs,
  viewPrsMergedFullSweepIntervalMs,
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAutoScriptTimeoutMs,
  viewPrsManualScriptTimeoutMs,
  viewPrsQuickCheckScriptTimeoutMs,
  viewPrsQuickCheckAllScriptTimeoutMs,
  viewPrsQuickCheckAllJobs,
  viewPrsAckScriptTimeoutMs,
  viewPrsAckRefreshScriptTimeoutMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsBackfillStatusTimeoutMs,
  viewPrsBackfillActionTimeoutMs,
  viewPrsViewerLoginCacheTtlMs,
  // State
  viewPrsSchedulerState,
  // Helpers and utilities
  isViewPrsFixtureRow,
  parseTimestamp,
  readJsonFileIfExists,
  isObject,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  normalizeNotesComment,
  normalizeNotes,
  normalizeAuthorComment,
  normalizeAuthorCommentSentiment,
  normalizeViewPrsAuthorComments,
  normalizePerRepoMap,
  normalizeViewPrsUserState,
  backupStamp,
  writeJsonFileWithBackup,
  writeViewPrsUserState,
  writeViewPrsAuthorComments,
  readViewPrsAuthorComments,
  mergeMissingPerRepoMap,
  migrateLegacyViewPrsUserState,
  writeJsonFileBestEffort,
  normalizeDisplayName,
  resolveViewPrsActorKey,
  resolveActorNameFromGitHub,
  buildViewPrsActorsMap,
  getManualCooldownSkipReason,
  readViewPrsSchedulerState,
  persistViewPrsSchedulerState,
  setLastManualRunNow,
  getManualFullRunAtForRepo,
  formatScriptFailureMessage,
  runViewPrsCommand,
  runViewPrsScript,
  runViewPrsBashCommand,
  runViewPrsShellScript,
  runInsightsHookScript,
  buildInsightsHookMetadata,
  parseBackfillCommandOutput,
  getBackfillLogTail,
  getViewPrsBackfillPublicState,
  runViewPrsBackfillAction,
  isCommandAvailable,
  getDependencyStatus,
  isGhAuthenticated,
  getViewPrsViewerLogin,
  resolveViewPrsDetailFilePath,
  readViewPrsDetailPayload,
  clearViewPrsDataCache,
  hydrateViewPrsEntryWithDetail,
  readViewPrsData,
  getViewPrsDataVersion,
  getViewPrsDataMeta,
  getViewPrsDataManifest,
  readLiveSummary,
  refreshRepoLiveSummary,
  getLiveSummaryVersion,
  getViewPrsSchedulerPublicState,
  getViewPrsAutoCircuitOpenState,
  buildAckRefreshBudgetSkipErrors,
  recordViewPrsAutoRefreshFailure,
  resetViewPrsAutoRefreshFailureState,
  resetAutoCircuitFailuresForRepos,
  resetAutoCircuitBreaker,
  getOpenAutoCircuitRepos,
  getViewPrsAutoRefreshRepos,
  getExplicitRefreshNumbers,
  inferTrackedRepos,
  subscribeRepoToRecent,
  viewPrsSourcesStorage,
  setPendingForRepo,
  clearPendingForRepo,
  clearPendingNumbersForRepo,
  getPendingForRepo,
  getReposWithPendingOpen,
  getReposWithPendingMergedClosed,
  getPendingUpdatePrNumberKeys,
  getPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  readPrDiffCache,
  syncPrDiffForEntry,
  enqueuePrDiffRefresh,
  enqueuePrDiffRefreshForData,
};
