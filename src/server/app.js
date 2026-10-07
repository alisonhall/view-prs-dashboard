const express = require("express");
const fs = require("fs");
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
const { mergePrDetailFields } = require("./helpers/view-prs-pr-detail-storage");
const {
  runMigration: runPrDetailMigration,
} = require("../script/migrate-pr-detail-sidecar-v1");
const {
  createViewPrsActorHelpers,
} = require("./helpers/view-prs-actor-helpers");
const { createAppConfig } = require("./config/app-config");
const { createFileIoHelpers } = require("./helpers/file-io-helpers");
const { createCommandExecutionHelpers } = require("./helpers/command-execution-helpers");
const { createSchedulerHelpers } = require("./helpers/scheduler-helpers");

// Configuration and constants
// Initialize configuration from config module
const viewPrsDir = path.resolve(__dirname, "../..");
const config = createAppConfig({
  viewPrsDir,
  env: process.env,
  isTestEnv: process.env.NODE_ENV === "test",
});

// Extract commonly used config values for compatibility
const {
  defaultViewPrsRepo,
  viewPrsUiDir,
  viewPrsUiIndexFile,
  viewPrsDataFile,
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
  activePrNumbers: [],
  consecutiveAutoFailures: 0,
  autoCircuitOpenUntil: null,
  lastAutoCircuitOpenedAt: null,
  isQuickCheckInProgress: false,
  lastQuickCheckAt: null,
  lastQuickCheckAttemptAt: null,
  lastQuickCheckSkipReason: null,
  lastQuickCheckError: null,
  // Set when a quick check is skipped specifically because a full auto
  // refresh was already running (see runViewPrsQuickCheck's own guard) -
  // consumed by runViewPrsAutoRefresh's finally block to fire an immediate
  // catch-up quick check as soon as that blocking refresh finishes, instead
  // of leaving detection of anything that changed in the meantime (e.g. a
  // brand-new PR) to wait for the next periodic quick-check tick, which for
  // a slow multi-repo sweep could be a much longer wait than the quick
  // check's ~5 minute interval would suggest.
  quickCheckSkippedWhileAutoRunInProgress: false,
  lastMergedDrainAt: null,
  isMergedDrainInProgress: false,
  pendingByRepo: {},
};

const viewPrsActivePrCounts = new Map();

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

const syncSchedulerActivePrNumbers = () => {
  viewPrsSchedulerState.activePrNumbers = [...viewPrsActivePrCounts.keys()]
    .map(parseActivePrKey)
    .sort((left, right) => {
      if (left.repo !== right.repo) {
        return left.repo < right.repo ? -1 : 1;
      }
      return Number(left.prNumber) - Number(right.prNumber);
    });
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

const addSchedulerActivePrNumbers = (prNumbers, repo) => {
  const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
  uniqueNumbers.forEach((prNumber) => {
    incrementActivePrNumber(prNumber, repo);
  });
};

const removeSchedulerActivePrNumbers = (prNumbers, repo) => {
  const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
  uniqueNumbers.forEach((prNumber) => {
    decrementActivePrNumber(prNumber, repo);
  });
};

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

const getLatestMergedPrNumbersForRepo = (repo, limit = 15) => {
  const safeRepo = toTrimmedString(repo);
  if (!safeRepo) {
    return [];
  }

  const maxCount = Math.max(1, Math.min(15, Number.parseInt(String(limit), 10) || 15));
  const data = callReadViewPrsData();
  return Object.values(data?.byPrNumber || {})
    .filter((entry) => entry?.repo === safeRepo)
    .filter((entry) => String(entry?.section || "") === "merged")
    .sort((left, right) => {
      const leftMs = Date.parse(String(left?.data?.mergedAt || left?.mergedAt || "")) || 0;
      const rightMs = Date.parse(String(right?.data?.mergedAt || right?.mergedAt || "")) || 0;
      return rightMs - leftMs;
    })
    .slice(0, maxCount)
    .map((entry) => String(entry?.prNumber || entry?.data?.number || "").trim())
    .filter((prNumber) => /^\d+$/.test(prNumber));
};

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
  viewPrsPrDiffDir,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
});

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

  const existingPrNumbers = new Set(Object.keys(existingByPrNumber || {}));
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
      if (!/^\d+$/.test(prNumber) || existingPrNumbers.has(prNumber)) {
        return;
      }

      const repo = isRepoSlug(parsed.repo) ? parsed.repo : fallbackRepo;
      collected.push({
        prNumber,
        repo,
        fetchedAt: toTrimmedString(parsed.fetchedAt),
      });
      existingPrNumbers.add(prNumber);
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

const hydrateViewPrsEntryWithDetail = (entry) => {
  if (!isObject(entry) || !isObject(entry.data)) {
    return entry;
  }

  const detailPayload = readViewPrsDetailPayload(entry.data.detailRef);
  if (!detailPayload) {
    return entry;
  }

  return {
    ...entry,
    data: mergePrDetailFields(entry.data, detailPayload),
  };
};

const {
  writeJsonFileWithBackup,
  writeViewPrsUserState,
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
  addActorName,
  normalizeDisplayName,
  normalizeActorLoginAliases,
  normalizeActorNameCacheEntries,
  resolveCanonicalActorLogin,
} = createViewPrsActorHelpers({
  toTrimmedString,
});

const writeJsonFileBestEffort = (filePath, value) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (_error) {
    // Best-effort cache persistence only.
  }
};


const readViewPrsActorLoginAliases = () =>
  normalizeActorLoginAliases(
    readJsonFileIfExists(viewPrsActorLoginAliasesFile, {}),
  );

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

const buildViewPrsActorsMap = (byPrNumberRaw = {}) => {
  const actorNameCacheEntries = normalizeActorNameCacheEntries(
    readJsonFileIfExists(viewPrsActorNameCacheFile, {}),
  );
  const actorsMap = {
    ...actorNameCacheEntries,
  };
  const unresolvedLogins = new Set();
  const observedLogins = new Set();
  const fallbackNamesByLogin = {};

  const addActorNameOrTrack = (login, name) => {
    const normalizedLogin = toTrimmedString(login);
    const normalizedName = normalizeDisplayName(name);
    if (!normalizedLogin) {
      return;
    }

    observedLogins.add(normalizedLogin);
    fallbackNamesByLogin[normalizedLogin] =
      normalizedName || fallbackNamesByLogin[normalizedLogin] || normalizedLogin;

    addActorName(actorsMap, normalizedLogin, normalizedName);
    if (!actorsMap[normalizedLogin]) {
      unresolvedLogins.add(normalizedLogin);
    }
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

  let cacheUpdated = false;
  for (const login of unresolvedLogins) {
    if (actorsMap[login]) {
      continue;
    }
    const resolvedName = resolveActorNameFromGitHub(login);
    if (resolvedName) {
      actorsMap[login] = resolvedName;
      cacheUpdated = true;
    }
  }

  for (const login of observedLogins) {
    if (login === "unknown") {
      continue;
    }

    const resolvedOrFallbackName =
      toTrimmedString(actorsMap[login]) ||
      toTrimmedString(fallbackNamesByLogin[login]) ||
      login;

    if (!actorsMap[login]) {
      actorsMap[login] = resolvedOrFallbackName;
    }

    if (!toTrimmedString(actorNameCacheEntries[login])) {
      actorNameCacheEntries[login] = resolvedOrFallbackName;
      cacheUpdated = true;
    }
  }

  if (cacheUpdated) {
    const latestActorNameCacheEntries = normalizeActorNameCacheEntries(
      readJsonFileIfExists(viewPrsActorNameCacheFile, {}),
    );
    const mergedActorNameCacheEntries = {
      ...latestActorNameCacheEntries,
    };
    let mergedHasUpdates = false;

    Object.entries(actorNameCacheEntries).forEach(([login, displayName]) => {
      const normalizedLogin = toTrimmedString(login);
      const normalizedName = normalizeDisplayName(displayName);
      if (!normalizedLogin || !normalizedName) {
        return;
      }
      if (toTrimmedString(mergedActorNameCacheEntries[normalizedLogin])) {
        return;
      }

      mergedActorNameCacheEntries[normalizedLogin] = normalizedName;
      mergedHasUpdates = true;
    });

    if (mergedHasUpdates) {
      writeJsonFileBestEffort(
        viewPrsActorNameCacheFile,
        mergedActorNameCacheEntries,
      );
    }
  }

  return actorsMap;
};

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

const {
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
} = createViewPrsSchedulerHelpers({
  fs,
  console,
  parseTimestamp,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
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
const callEmitJobEvent = (...args) =>
  (module.exports.emitJobEvent || emitJobEvent)(...args);
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
    { timeoutMs: 120000 },
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
    { timeoutMs: 30000 },
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
    { timeoutMs: 30000 },
  );
};

// Fetches just the authoritative current label set for one PR - unlike a
// full `check-open-pr-updates.sh --pr <n>` refresh (which also re-fetches
// comments, reviews, file diffs, review threads, etc. and can take minutes
// for a PR with a lot of history, especially merged ones), this is a single
// small `gh` call so the UI can reflect a just-applied label immediately
// instead of waiting on the next scheduled full refresh.
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
    { timeoutMs: 20000 },
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

const acquirePrStateLockForPatch = async ({ maxWaitMs = 5000 } = {}) => {
  const deadlineMs = Date.now() + maxWaitMs;
  for (;;) {
    try {
      fs.mkdirSync(viewPrsDataFileLockDir);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
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

  await acquirePrStateLockForPatch();
  try {
    const current = readJsonFileIfExists(viewPrsDataFile, {});
    const entry = current?.byPrNumber?.[safePrNumber];
    if (!isObject(entry) || entry.repo !== safeRepo || !isObject(entry.data)) {
      return false;
    }

    entry.data.labels = Array.isArray(labels) ? labels : [];
    writeJsonFileWithBackup(viewPrsDataFile, current, "labels-patch");
    return true;
  } finally {
    releasePrStateLockForPatch();
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

const readViewPrsData = () => {
  const rawUserState = readJsonFileIfExists(viewPrsUserStateFile, {});
  const normalizedUserState = normalizeViewPrsUserState(rawUserState);

  if (!fs.existsSync(viewPrsDataFile)) {
    return {
      byPrNumber: {},
      lastRun: null,
      viewerLogin: getViewPrsViewerLogin(),
      actorsMap: {},
      actorLoginAliases: readViewPrsActorLoginAliases(),
      ackByRepo: normalizedUserState.ackByRepo,
      reverifyByRepo: normalizedUserState.reverifyByRepo,
      inReviewByRepo: normalizedUserState.inReviewByRepo,
      flaggedByRepo: normalizedUserState.flaggedByRepo,
    };
  }

  try {
    const raw = fs.readFileSync(viewPrsDataFile, "utf8");
    const parsed = JSON.parse(raw);
    const mergedUserState = migrateLegacyViewPrsUserState(
      parsed,
      normalizedUserState,
    );
    const byPrNumberRaw = parsed.byPrNumber || {};
    const fallbackRepo = inferFallbackRepoForNotesOnlyEntries(
      byPrNumberRaw,
      parsed.lastRun,
    );
    const pendingUpdateKeys = getPendingUpdatePrNumberKeys();
    const byPrNumber = Object.fromEntries(
      Object.entries(byPrNumberRaw)
        .filter(([, entry]) => !isViewPrsFixtureRow(entry))
        .map(([prNumber, entry]) => {
          if (!isObject(entry)) {
            return [prNumber, entry];
          }
          const hydratedEntry = hydrateViewPrsEntryWithDetail(entry);
          const notes = mergedUserState.notesByPrNumber[prNumber];
          const withNotes = notes ? { ...hydratedEntry, notes } : hydratedEntry;
          const isUpdatePending = pendingUpdateKeys.has(
            `${toTrimmedString(withNotes?.repo)}#${prNumber}`,
          );
          if (!isUpdatePending) {
            return [prNumber, withNotes];
          }
          return [
            prNumber,
            {
              ...withNotes,
              data: { ...(withNotes.data || {}), updatePending: true },
            },
          ];
        }),
    );
    collectMissingPrsFromDiffCache(byPrNumber, fallbackRepo).forEach(
      ({ prNumber, repo, fetchedAt }) => {
        const notes = mergedUserState.notesByPrNumber[prNumber] || null;
        const diffOnlyEntry = buildGitDiffOnlyMergedEntry(prNumber, repo, fetchedAt);
        byPrNumber[prNumber] = notes
          ? { ...diffOnlyEntry, notes }
          : diffOnlyEntry;
      },
    );
    Object.entries(mergedUserState.notesByPrNumber).forEach(
      ([prNumber, notes]) => {
        if (byPrNumber[prNumber]) {
          return;
        }
        byPrNumber[prNumber] = buildNotesOnlyMergedEntry(
          prNumber,
          notes,
          fallbackRepo,
        );
      },
    );
    return {
      byPrNumber,
      lastRun: parsed.lastRun || null,
      viewerLogin:
        Object.values(byPrNumber)
          .map((entry) => toTrimmedString(entry?.data?.viewerLogin))
          .find(Boolean) || getViewPrsViewerLogin(),
      actorsMap: buildViewPrsActorsMap(byPrNumber),
      actorLoginAliases: readViewPrsActorLoginAliases(),
      ackByRepo: mergedUserState.ackByRepo,
      reverifyByRepo: mergedUserState.reverifyByRepo,
      inReviewByRepo: mergedUserState.inReviewByRepo,
      flaggedByRepo: mergedUserState.flaggedByRepo,
    };
  } catch (error) {
    return {
      byPrNumber: {},
      lastRun: null,
      viewerLogin: getViewPrsViewerLogin(),
      actorsMap: {},
      actorLoginAliases: readViewPrsActorLoginAliases(),
      ackByRepo: normalizedUserState.ackByRepo,
      reverifyByRepo: normalizedUserState.reverifyByRepo,
      inReviewByRepo: normalizedUserState.inReviewByRepo,
      flaggedByRepo: normalizedUserState.flaggedByRepo,
      readError: error.message,
    };
  }
};

const getViewPrsDataMeta = () => {
  try {
    if (!fs.existsSync(viewPrsDataFile)) {
      return {
        dataVersion: "missing",
        lastModifiedAt: null,
        sizeBytes: 0,
      };
    }

    const stats = fs.statSync(viewPrsDataFile);
    const mtimeMs = Number.isFinite(stats.mtimeMs)
      ? Math.trunc(stats.mtimeMs)
      : Date.parse(String(stats.mtime || "")) || 0;

    return {
      dataVersion: `${mtimeMs}:${stats.size}`,
      lastModifiedAt: mtimeMs > 0 ? new Date(mtimeMs).toISOString() : null,
      sizeBytes: Number.isFinite(stats.size) ? stats.size : 0,
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

// Auto-refresh logic
const runViewPrsAutoRefresh = async ({
  skipCooldownChecks = false,
  reposOverride = null,
} = {}) => {
  if (viewPrsSchedulerState.isAutoRunInProgress) {
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.SKIPPED,
      detail: { reason: "already-in-progress" },
    });
    return;
  }

  const nowMs = Date.now();

  if (!skipCooldownChecks) {
    const circuitState = getViewPrsAutoCircuitOpenState({ nowMs });
    if (circuitState.isOpen) {
      viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
      viewPrsSchedulerState.lastAutoSkipReason = `auto refresh circuit open until ${circuitState.openUntilIso}`;
      viewPrsSchedulerState.lastAutoError = null;
      callEmitJobEvent({
        job: JOB_NAMES.AUTO_REFRESH,
        phase: JOB_PHASES.SKIPPED,
        detail: {
          reason: "circuit-open",
          message: viewPrsSchedulerState.lastAutoSkipReason,
        },
      });
      return;
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
        reason: "missing-dependencies",
        missing: dependencyStatus.missing,
      },
    });
    return;
  }

  if (!skipCooldownChecks) {
    const skipReason = getManualCooldownSkipReason({
      nowMs,
      lastManualRunAt: viewPrsSchedulerState.lastManualRunAt,
      manualCooldownMs: viewPrsManualCooldownMs,
    });
    if (skipReason) {
      viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
      viewPrsSchedulerState.lastAutoSkipReason = skipReason;
      viewPrsSchedulerState.lastAutoError = null;
      callEmitJobEvent({
        job: JOB_NAMES.AUTO_REFRESH,
        phase: JOB_PHASES.SKIPPED,
        detail: { reason: "manual-cooldown", message: skipReason },
      });
      return;
    }
  }

  viewPrsSchedulerState.isAutoRunInProgress = true;
  viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
  viewPrsSchedulerState.lastAutoSkipReason = null;

  const autoStartedAt = viewPrsSchedulerState.lastAutoAttemptAt;
  const autoTriggerMs = Date.now();
  let emittedAutoRefreshStart = false;
  let finishSuccessCount = 0;
  let finishFailureCount = 0;
  let finishRepos = [];

  try {
    const reposToRefresh =
      Array.isArray(reposOverride) && reposOverride.length > 0
        ? reposOverride
        : getViewPrsAutoRefreshRepos();
    console.log(
      `[view-prs] auto refresh repos (${reposToRefresh.length}): ${reposToRefresh.join(", ") || "(none)"}`,
    );
    finishRepos = reposToRefresh;
    callEmitJobEvent({
      job: JOB_NAMES.AUTO_REFRESH,
      phase: JOB_PHASES.START,
      detail: { repos: reposToRefresh, repoCount: reposToRefresh.length },
    });
    emittedAutoRefreshStart = true;
    const refreshResults = new Array(reposToRefresh.length);
    const repoConcurrency = Math.min(
      reposToRefresh.length,
      getViewPrsAutoRepoConcurrency(),
    );
    let nextRepoIndex = 0;

    const runRepoRefresh = async (repo) => {
      const seededPrNumbers = getLatestMergedPrNumbersForRepo(repo, 15);
      const repoStartMs = Date.now();
      let repoFirstPrProgressMs = null;

      try {
        addSchedulerActivePrNumbers(seededPrNumbers, repo);
        await callRunViewPrsScript(
          [
            viewPrsRunScriptRelativePath,
            "--quiet",
            "--open",
            "none",
            "--repo",
            repo,
            "--show-reason",
          ],
          10 * 1024 * 1024,
          {
            timeoutMs: viewPrsAutoScriptTimeoutMs,
            // Tags every active-PR-tracking call this run makes (this
            // options.repo, read by runViewPrsBashCommand) with the repo
            // being scanned - see buildActivePrKey's own comment.
            repo,
            progressTracker: {
              onStart: () => {
                if (repoFirstPrProgressMs === null) {
                  repoFirstPrProgressMs = Date.now();
                }
              },
            },
          },
        );
        const repoFinishedMs = Date.now();
        // A full run refreshes both sections, so anything queued by the
        // quick-check for this repo has now been addressed.
        clearPendingForRepo(repo);
        return {
          ok: true,
          repo,
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
      } catch (failure) {
        const failureMessage =
          failure?.didTimeout === true
            ? `Auto refresh timed out after ${Math.round(
              Number(failure?.timeoutMs || viewPrsAutoScriptTimeoutMs) / 1000,
            )}s`
            : failure?.error?.message || "Auto refresh failed";
        const repoFinishedMs = Date.now();
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
        removeSchedulerActivePrNumbers(seededPrNumbers, repo);
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
    const successCount = refreshResults.filter(
      (result) => result && result.ok === true,
    ).length;
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
        runPrDetailMigration({ silent: true });
      } catch (migrationError) {
        console.error(
          `[view-prs] warning: PR detail split failed: ${migrationError.message || migrationError}`,
        );
      }
    }

    if (failures.length === 0 && successCount > 0) {
      resetViewPrsAutoRefreshFailureState();
    }

    viewPrsSchedulerState.lastAutoError =
      failures.length > 0
        ? failures.join("; ")
        : successCount > 0
          ? null
          : "Auto refresh did not run for any repo";

    if (failures.length > 0) {
      recordViewPrsAutoRefreshFailure();
    }

    appendActionLogEntry({
      action: "auto-refresh",
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
  } catch (failure) {
    viewPrsSchedulerState.lastAutoError =
      failure?.error?.message || "Auto refresh failed";
    recordViewPrsAutoRefreshFailure();
    appendActionLogEntry({
      action: "auto-refresh",
      triggeredAt: autoStartedAt,
      durationMs: Date.now() - autoTriggerMs,
      ok: false,
      error: viewPrsSchedulerState.lastAutoError,
    });
    console.error(
      `[view-prs] auto refresh failed: ${viewPrsSchedulerState.lastAutoError}`,
    );
  } finally {
    viewPrsSchedulerState.isAutoRunInProgress = false;
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
        },
      });
    }
    if (viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress) {
      // See the flag's own comment (near viewPrsSchedulerState's
      // definition) - a quick check was starved by this exact refresh being
      // in progress, so catch up immediately rather than leaving it to the
      // next periodic tick. Fire-and-forget, same as the interval-driven
      // caller: this function's own caller (a full sweep's setInterval, or
      // quick-check's own fast-follow) isn't waiting on this.
      viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
      void callRunViewPrsQuickCheck();
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
} = {}) => {
  if (
    viewPrsSchedulerState.isQuickCheckInProgress ||
    viewPrsSchedulerState.isAutoRunInProgress
  ) {
    viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckSkipReason = "already-in-progress";
    if (viewPrsSchedulerState.isAutoRunInProgress) {
      viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = true;
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
        detail: { reason: "already-in-progress", willRunAfter: false },
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
      },
    });
    return { skipped: true, skipReason: "missing-dependencies", missing: dependencyStatus.missing };
  }

  if (getViewPrsAutoCircuitOpenState({ nowMs: Date.now() }).isOpen) {
    viewPrsSchedulerState.lastQuickCheckAttemptAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckSkipReason = "circuit-open";
    callEmitJobEvent({
      job: JOB_NAMES.QUICK_CHECK,
      phase: JOB_PHASES.SKIPPED,
      detail: { reason: "circuit-open", willRunAfter: false },
    });
    return { skipped: true, skipReason: "circuit-open" };
  }

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
    detail: { scope: quickCheckScope },
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
      try {
        const result = await callRunViewPrsScript(
          [viewPrsRunScriptRelativePath, "--quiet", "--quick-check", "--repo", repo, ...extraArgs],
          1024 * 1024,
          { timeoutMs: scriptTimeoutMs, trackSchedulerPrProgress: false },
        );
        const parsed = JSON.parse(String(result?.stdout || "").trim() || "{}");
        const pendingOpen = Array.isArray(parsed.pendingOpen) ? parsed.pendingOpen : [];
        const pendingMergedClosed = Array.isArray(parsed.pendingMergedClosed)
          ? parsed.pendingMergedClosed
          : [];

        reposChecked.push(repo);
        newPendingOpenCount += pendingOpen.length;
        newPendingMergedClosedCount += pendingMergedClosed.length;

        if (pendingOpen.length === 0 && pendingMergedClosed.length === 0) {
          // Clear any stale pending flag this repo left behind from an
          // earlier quick check - previously this returned early here
          // without clearing, so a since-resolved repo could keep
          // reporting an old pending count indefinitely.
          clearPendingForRepo(repo);
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
        const message = repoError?.message || String(repoError);
        reposFailed.push({ repo, error: message });
        console.warn(`[view-prs] quick-check failed for ${repo}: ${message}`);
      }
    };

    if (prNumbers) {
      await runQuickCheckForRepo(targetRepo, ["--quick-check-numbers", prNumbers]);
    } else if (Array.isArray(repoRequests) && repoRequests.length > 0) {
      // Sequential, not Promise.all: each repo's own script call already
      // runs up to --jobs `gh pr view` processes concurrently, so checking
      // every repo at once here would multiply that with no cap (e.g. 5
      // repos x 12 jobs = 60 concurrent gh processes). One repo at a time
      // keeps total concurrent load bounded to a single repo's worth.
      for (const { repo, prNumbers: repoPrNumbers } of repoRequests) {
        const extraArgs = ["--jobs", String(viewPrsQuickCheckAllJobs)];
        if (repoPrNumbers) {
          extraArgs.push("--quick-check-numbers", repoPrNumbers);
        }
        await runQuickCheckForRepo(repo, extraArgs, viewPrsQuickCheckAllScriptTimeoutMs);
      }
    } else {
      const repos = getViewPrsAutoRefreshRepos();
      await Promise.all(repos.map((repo) => runQuickCheckForRepo(repo)));
    }

    viewPrsSchedulerState.lastQuickCheckAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckError = null;
    persistViewPrsSchedulerState();

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
    viewPrsSchedulerState.isQuickCheckInProgress = false;
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
  try {
    await callRunViewPrsAutoRefresh({ reposOverride: reposToDrain });
  } finally {
    viewPrsSchedulerState.isMergedDrainInProgress = false;
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
const runTaskGroup = async (taskType, entries) => {
  const repos = entries.map((entry) => entry.repo);
  if (taskType === "quickCheck") {
    const result = await callRunViewPrsQuickCheck({
      repoRequests: repos.map((repo) => ({ repo })),
    });
    return { ok: !result?.fatalError, error: result?.fatalError || null };
  }
  if (taskType === "autoRefresh") {
    await callRunViewPrsAutoRefresh({ reposOverride: repos });
    return { ok: true, error: null };
  }
  // mergedDrain
  await callRunViewPrsMergedQueueDrain({ reposOverride: repos });
  return { ok: true, error: null };
};

// The dispatcher's single periodic driver, replacing the three independent
// setIntervals below it (see REACT_MIGRATION_PLAN.md's dispatcher plan).
// Picks every entry that's both due and affordable within the shared
// gh-process budget (manual routes' own reserveGhSlots calls - see
// view-prs-mutation-routes.js - count against the same budget, so the
// background dispatcher throttles around manual work without ever making
// a manual action wait), groups them by task type (see runTaskGroup for
// why), runs each group's one call concurrently with the other groups', and
// records the outcome back onto every entry in the group.
// Re-entrancy guard: runDispatcherTick can be invoked from 3 places - the
// periodic setInterval, initializeScheduler's own startup call, and the
// urgency-bump call sites in runViewPrsQuickCheck - and a tick can legitimately
// take a while (real `gh` calls in production). Without this guard, an
// urgency bump firing WHILE a tick is already mid-flight would start a
// SECOND, overlapping tick whose own pickNextBatch doesn't yet see the
// outer tick's in-progress entries as isRunning (they're marked one
// task-type group at a time, sequentially, not all upfront) - confirmed to
// cause the same entry being selected and run twice within what's
// conceptually one selection round. A bump that arrives while a tick is
// already running just waits for the NEXT tick (periodic, ≤5s by default,
// or the current tick's own completion re-triggering nothing - the bumped
// entry's nextDueAt is already set, so the very next tick picks it up
// regardless) rather than forcing a correctness-risking overlap.
let isDispatcherTickInFlight = false;

const runDispatcherTick = async () => {
  if (isDispatcherTickInFlight) {
    return;
  }
  isDispatcherTickInFlight = true;
  try {
    const dispatcher = callDispatcherHelpers();
    dispatcher.getOrInitRegistry();
    const nowMs = Date.now();
    const availableGhSlots = Math.max(
      0,
      effectiveDispatcherGhProcessBudget - dispatcher.getReservedGhSlots(),
    );
    const { selected } = dispatcher.pickNextBatch({ nowMs, availableGhSlots });
    if (selected.length === 0) {
      return;
    }

    const groupsByTaskType = new Map();
    selected.forEach((entry) => {
      if (!groupsByTaskType.has(entry.taskType)) {
        groupsByTaskType.set(entry.taskType, []);
      }
      groupsByTaskType.get(entry.taskType).push(entry);
    });

    // Sequential across task-type groups, not Promise.all - deliberately.
    // runViewPrsQuickCheck's own guard checks isAutoRunInProgress: running
    // quickCheck's group concurrently with autoRefresh's would make
    // quickCheck's own guard trip on every tick where both happen to be
    // due together - the common case right after startup/migration, not a
    // rare edge case - triggering its existing catch-up retry (void
    // callRunViewPrsQuickCheck() in runViewPrsAutoRefresh's finally block)
    // repeatedly. Sequencing trades a little wall-clock time within one
    // tick for never hitting that guard at all; this is a background
    // scheduler, not a latency-critical path.
    for (const [taskType, entries] of groupsByTaskType) {
      const startedAtMs = Date.now();
      entries.forEach((entry) => dispatcher.markEntryRunning(entry, { nowMs: startedAtMs }));
      try {
        const { ok, error } = await runTaskGroup(taskType, entries);
        const finishedAtMs = Date.now();
        entries.forEach((entry) =>
          dispatcher.markEntryFinished(entry, { nowMs: finishedAtMs, ok, error }),
        );
      } catch (error) {
        const finishedAtMs = Date.now();
        entries.forEach((entry) =>
          dispatcher.markEntryFinished(entry, {
            nowMs: finishedAtMs,
            ok: false,
            error: error?.message || String(error),
          }),
        );
      }
    }
  } finally {
    isDispatcherTickInFlight = false;
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

// Vite dev middleware (React/JSX transform)
//
// index.html loads react-app.jsx as an ES module. Express can't transpile
// JSX or resolve bare module specifiers on its own, so outside of a
// production build we embed Vite's dev server in middleware mode and let it
// handle those requests before falling back to static files / API routes.
const isProductionEnv = process.env.NODE_ENV === "production";
// This app is mounted at /view-prs by the root server (index.js), but Vite
// needs to know that prefix too: it uses `base` to emit browser-facing URLs
// for its client script, HMR, and resolved imports (/@vite/client, /@fs/...,
// /components/PrTableApp.jsx, etc). Without it those come back rooted at
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

// Create and configure the Express app
const createViewPrsApp = () => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (!isProductionEnv) {
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
    if (isProductionEnv) {
      res.sendFile(viewPrsUiIndexFile);
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
    viewPrsRunScriptRelativePath,
    callGetDependencyStatus,
    callRunViewPrsScript,
    viewPrsManualScriptTimeoutMs,
    viewPrsAckScriptTimeoutMs,
    viewPrsAckRefreshScriptTimeoutMs,
    viewPrsAckTotalRefreshTimeoutMs,
    defaultViewPrsRepo,
    setLastManualRunNow,
    clearPendingForRepo,
    appendActionLogEntry,
    readViewPrsData,
    enqueuePrDiffRefreshForData,
    formatScriptFailureMessage,
    viewPrsSchedulerState,
    resetViewPrsAutoRefreshFailureState,
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
    readViewPrsAuthorComments,
    writeViewPrsAuthorComments,
    appendActionLogEntry,
    readViewPrsData,
    readViewPrsActorLoginAliases,
    resolveCanonicalActorLogin,
    isRepoSlug,
    syncPrDiffForEntry,
    runInsightsHookScript: callRunInsightsHookScript,
  });

  registerViewPrsDataRoutes({
    app,
    fs,
    isObject,
    readUserDefaults,
    writeUserDefaults,
    readJsonFileIfExists,
    getViewPrsBackfillPublicState,
    readViewPrsData,
    enqueuePrDiffRefreshForData,
    getViewPrsDataMeta,
    getViewPrsDataManifest,
    getViewPrsSchedulerPublicState,
    viewPrsActorNameCacheFile,
    viewPrsActorLoginAliasesFile,
    viewPrsBackfillLogFile,
    viewPrsBackfillPidFile,
    bumpDispatcherEntry,
    dispatcherTaskTypes: DISPATCHER_TASK_TYPES,
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
  addActorName,
  writeJsonFileBestEffort,
  normalizeDisplayName,
  normalizeActorLoginAliases,
  readViewPrsActorLoginAliases,
  resolveCanonicalActorLogin,
  resolveActorNameFromGitHub,
  buildViewPrsActorsMap,
  getManualCooldownSkipReason,
  readViewPrsSchedulerState,
  persistViewPrsSchedulerState,
  setLastManualRunNow,
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
  hydrateViewPrsEntryWithDetail,
  readViewPrsData,
  getViewPrsDataMeta,
  getViewPrsDataManifest,
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
  getPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  readPrDiffCache,
  syncPrDiffForEntry,
  enqueuePrDiffRefresh,
  enqueuePrDiffRefreshForData,
};
