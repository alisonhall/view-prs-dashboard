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
  viewPrsAckScriptTimeoutMs,
  viewPrsAckRefreshScriptTimeoutMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsBackfillStatusTimeoutMs,
  viewPrsBackfillActionTimeoutMs,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
  viewPrsViewerLoginCacheTtlMs,
  viewPrsBackupRetention,
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
  lastQuickCheckError: null,
  lastMergedDrainAt: null,
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
  runViewPrsCommand,
  viewPrsPrDiffDir,
  viewPrsPrDiffTimeoutMs,
  viewPrsPrDiffConcurrency,
});

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
    const { stdout, stderr, command } = await runViewPrsShellScript(
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
  const result = await runViewPrsShellScript(
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
    return;
  }

  const nowMs = Date.now();

  if (!skipCooldownChecks) {
    const circuitState = getViewPrsAutoCircuitOpenState({ nowMs });
    if (circuitState.isOpen) {
      viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
      viewPrsSchedulerState.lastAutoSkipReason = `auto refresh circuit open until ${circuitState.openUntilIso}`;
      viewPrsSchedulerState.lastAutoError = null;
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
      return;
    }
  }

  viewPrsSchedulerState.isAutoRunInProgress = true;
  viewPrsSchedulerState.lastAutoAttemptAt = new Date().toISOString();
  viewPrsSchedulerState.lastAutoSkipReason = null;

  const autoStartedAt = viewPrsSchedulerState.lastAutoAttemptAt;
  const autoTriggerMs = Date.now();

  try {
    const reposToRefresh =
      Array.isArray(reposOverride) && reposOverride.length > 0
        ? reposOverride
        : getViewPrsAutoRefreshRepos();
    console.log(
      `[view-prs] auto refresh repos (${reposToRefresh.length}): ${reposToRefresh.join(", ") || "(none)"}`,
    );
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
  }
};

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
const runViewPrsQuickCheck = async ({ awaitTargetedRefresh = false } = {}) => {
  if (
    viewPrsSchedulerState.isQuickCheckInProgress ||
    viewPrsSchedulerState.isAutoRunInProgress
  ) {
    return { skipped: true, skipReason: "already-in-progress" };
  }

  const dependencyStatus = callGetDependencyStatus();
  if (!dependencyStatus.ok) {
    return { skipped: true, skipReason: "missing-dependencies", missing: dependencyStatus.missing };
  }

  if (getViewPrsAutoCircuitOpenState({ nowMs: Date.now() }).isOpen) {
    return { skipped: true, skipReason: "circuit-open" };
  }

  viewPrsSchedulerState.isQuickCheckInProgress = true;

  try {
    const repos = getViewPrsAutoRefreshRepos();
    const reposWithPendingOpen = new Set();
    const reposChecked = [];
    const reposFailed = [];
    let newPendingOpenCount = 0;
    let newPendingMergedClosedCount = 0;

    await Promise.all(
      repos.map(async (repo) => {
        try {
          const result = await callRunViewPrsScript(
            [viewPrsRunScriptRelativePath, "--quiet", "--quick-check", "--repo", repo],
            1024 * 1024,
            { timeoutMs: viewPrsQuickCheckScriptTimeoutMs, trackSchedulerPrProgress: false },
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
        } catch (repoError) {
          const message = repoError?.message || String(repoError);
          reposFailed.push({ repo, error: message });
          console.warn(`[view-prs] quick-check failed for ${repo}: ${message}`);
        }
      }),
    );

    viewPrsSchedulerState.lastQuickCheckAt = new Date().toISOString();
    viewPrsSchedulerState.lastQuickCheckError = null;
    persistViewPrsSchedulerState();

    if (reposWithPendingOpen.size > 0) {
      // Fast-follow: don't wait for the next full-sweep timer once an open
      // PR is known to have actually changed. `awaitTargetedRefresh` lets
      // the startup sequence (initializeScheduler) wait for this priority
      // refresh to actually finish before it moves on to the full,
      // every-repo update - the periodic setInterval caller never passes
      // it, since blocking the quick-check timer on a potentially slow
      // refresh would defeat the point of checking quickly.
      const targetedRefresh = runViewPrsAutoRefresh({
        reposOverride: Array.from(reposWithPendingOpen),
      });
      if (awaitTargetedRefresh) {
        await targetedRefresh;
      } else {
        void targetedRefresh;
      }
    }

    return {
      skipped: false,
      reposChecked,
      reposFailed,
      newPendingOpenCount,
      newPendingMergedClosedCount,
    };
  } catch (error) {
    viewPrsSchedulerState.lastQuickCheckError = error?.message || "Quick check failed";
    console.error(`[view-prs] quick check failed: ${viewPrsSchedulerState.lastQuickCheckError}`);
    return { skipped: false, fatalError: viewPrsSchedulerState.lastQuickCheckError };
  } finally {
    viewPrsSchedulerState.isQuickCheckInProgress = false;
  }
};

// Batches up closed/merged PRs flagged by the quick-check into a full fetch.
// Runs on a much longer interval than the quick-check itself, and does
// nothing at all when nothing has actually changed (see viewPrsMergedFullSweepIntervalMs).
const runViewPrsMergedQueueDrain = async () => {
  const reposToDrain = getReposWithPendingMergedClosed().filter(
    (repo) => !getReposWithPendingOpen().includes(repo),
  );

  viewPrsSchedulerState.lastMergedDrainAt = new Date().toISOString();
  persistViewPrsSchedulerState();

  if (reposToDrain.length === 0) {
    return;
  }

  await runViewPrsAutoRefresh({ reposOverride: reposToDrain });
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

  return app;
};

// Scheduler management functions for external use
const initializeScheduler = () => {
  readViewPrsSchedulerState();
  // On startup, check what's actually changed before spending time on a
  // full every-repo update: run the quick check first, let its own
  // fast-follow targeted refresh for repos with pending open changes
  // actually finish (awaitTargetedRefresh - see runViewPrsQuickCheck's own
  // comment), and only then fall back to the unscoped full refresh. Not
  // awaited here - initializeScheduler's own callers (server.js) don't wait
  // on startup work finishing, and the periodic intervals below are
  // scheduled immediately regardless.
  void (async () => {
    await runViewPrsQuickCheck({ awaitTargetedRefresh: true });
    await runViewPrsAutoRefresh();
  })();
  setInterval(runViewPrsQuickCheck, viewPrsQuickCheckIntervalMs);
  setInterval(runViewPrsMergedQueueDrain, viewPrsMergedFullSweepIntervalMs);
  return setInterval(runViewPrsAutoRefresh, viewPrsAutoIntervalMs);
};

module.exports = {
  // Main app and scheduler
  createViewPrsApp,
  initializeScheduler,
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
  runViewPrsMergedQueueDrain,
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
  runViewPrsScript,
  runViewPrsBashCommand,
  runViewPrsShellScript,
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
