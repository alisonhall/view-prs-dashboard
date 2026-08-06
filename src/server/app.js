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
  createViewPrsActorHelpers,
} = require("./helpers/view-prs-actor-helpers");

// Configuration and constants
const defaultViewPrsRepo = "optum-rx-clinicalproducts/orx-cpp-mp-uis";
const requiredCommands = ["bash", "gh", "jq"];
const requiredPackages = ["marked"];

// Setup paths relative to view-prs directory
const viewPrsDir = path.resolve(__dirname, "../..");
const viewPrsUiDir = path.join(viewPrsDir, "src/ui");
const viewPrsUiIndexFile = path.join(viewPrsDir, "src/ui/index.html");
const viewPrsRunScriptRelativePath = "src/script/check-open-pr-updates.sh";
const viewPrsBackfillManagerRelativePath =
  "src/backfill/backfill-missing-bg.sh";
const _defaultSchedulerFile = path.join(
  viewPrsDir,
  "data/check-open-pr-updates.scheduler.json",
);
const viewPrsSchedulerFile =
  process.env.VIEW_PRS_SCHEDULER_FILE || _defaultSchedulerFile;
const viewPrsLegacySchedulerFile = path.join(
  viewPrsDir,
  "check-open-pr-updates.scheduler.json",
);
const _defaultDataFile = path.join(
  viewPrsDir,
  "data/check-open-pr-updates.data.json",
);
const viewPrsDataFile = process.env.VIEW_PRS_DATA_FILE || _defaultDataFile;
const _defaultPrDetailDir = path.join(path.dirname(viewPrsDataFile), "pr-details");
const viewPrsPrDetailDir =
  process.env.VIEW_PRS_PR_DETAIL_DIR || _defaultPrDetailDir;
const _defaultUserStateFile = path.join(
  viewPrsDir,
  "data/check-open-pr-updates.user-state.json",
);
const viewPrsUserStateFile =
  process.env.VIEW_PRS_USER_STATE_FILE || _defaultUserStateFile;
const _defaultAuthorCommentsFile = path.join(
  path.dirname(viewPrsUserStateFile),
  "check-open-pr-updates.author-comments.json",
);
const viewPrsAuthorCommentsFile =
  process.env.VIEW_PRS_AUTHOR_COMMENTS_FILE || _defaultAuthorCommentsFile;
const _defaultBackupDir = path.join(viewPrsDir, "data/backups");
const viewPrsBackupDir = process.env.VIEW_PRS_BACKUP_DIR || _defaultBackupDir;
const _defaultPrDiffDir = path.join(viewPrsDir, "data/pr-diffs");
const viewPrsPrDiffDir = process.env.VIEW_PRS_PR_DIFF_DIR || _defaultPrDiffDir;

// Hard enforcement: tests MUST redirect state writes to temp paths.
if (process.env.NODE_ENV === "test") {
  if (
    viewPrsDataFile === _defaultDataFile ||
    viewPrsUserStateFile === _defaultUserStateFile
  ) {
    throw new Error(
      "[view-prs] NODE_ENV=test but real production state file paths are in use. " +
      "Set VIEW_PRS_DATA_FILE and VIEW_PRS_USER_STATE_FILE env vars to temp paths.",
    );
  }
}
const viewPrsBackupRetention = Math.max(
  1,
  Number.parseInt(process.env.VIEW_PRS_BACKUP_RETENTION || "50", 10) || 50,
);
const _defaultActorNameCacheFile = path.join(
  viewPrsDir,
  "data/actor-name-cache.json",
);
const viewPrsActorNameCacheFile =
  process.env.VIEW_PRS_ACTOR_NAME_CACHE_FILE || _defaultActorNameCacheFile;
const _defaultActorLoginAliasesFile = path.join(
  viewPrsDir,
  "data/actor-login-aliases.json",
);
const viewPrsActorLoginAliasesFile =
  process.env.VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE ||
  _defaultActorLoginAliasesFile;
const prReviewsUsernamesFile = path.join(
  path.dirname(viewPrsDir),
  "pr-reviews/usernames.json",
);
const viewPrsBackfillManagerScript = path.join(
  viewPrsDir,
  viewPrsBackfillManagerRelativePath,
);
const _defaultActionLogFile = path.join(viewPrsDir, "data/action-log.json");
const viewPrsActionLogFile =
  process.env.VIEW_PRS_ACTION_LOG_FILE || _defaultActionLogFile;

if (process.env.NODE_ENV === "test") {
  if (
    viewPrsActorNameCacheFile === _defaultActorNameCacheFile ||
    viewPrsActorLoginAliasesFile === _defaultActorLoginAliasesFile
  ) {
    throw new Error(
      "[view-prs] NODE_ENV=test but real actor cache file paths are in use. " +
      "Set VIEW_PRS_ACTOR_NAME_CACHE_FILE and VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE env vars to temp paths.",
    );
  }
}
const viewPrsBackfillPidFile = path.join(
  viewPrsDir,
  "data/backfill-missing.pid",
);
const viewPrsBackfillLogFile = path.join(
  viewPrsDir,
  "data/backfill-missing.log",
);
const viewPrsUserDefaultsFile = path.join(
  viewPrsDir,
  "data/user-defaults.json",
);
const viewPrsAutoIntervalMs = 15 * 60 * 1000;
const viewPrsManualCooldownMs = 15 * 60 * 1000;
const viewPrsAutoCircuitFailureThreshold = Math.max(
  1,
  Number.parseInt(
    process.env.VIEW_PRS_AUTO_CIRCUIT_FAILURE_THRESHOLD || "3",
    10,
  ) || 3,
);
const viewPrsAutoCircuitCooldownMs = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_AUTO_CIRCUIT_COOLDOWN_MS || "1800000",
    10,
  ) || 1800000,
);
const viewPrsAutoScriptTimeoutMs = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_AUTO_SCRIPT_TIMEOUT_MS || "900000",
    10,
  ) || 900000,
);
const getViewPrsAutoRepoConcurrency = () =>
  Math.max(
    1,
    Number.parseInt(
      process.env.VIEW_PRS_AUTO_REPO_CONCURRENCY || "2",
      10,
    ) || 2,
  );
const viewPrsManualScriptTimeoutMs = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_MANUAL_SCRIPT_TIMEOUT_MS || "1200000",
    10,
  ) || 1200000,
);
const viewPrsAckScriptTimeoutMs = Math.max(
  60 * 1000,
  Number.parseInt(process.env.VIEW_PRS_ACK_SCRIPT_TIMEOUT_MS || "600000", 10) ||
  600000,
);
const viewPrsAckRefreshScriptTimeoutMs = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_ACK_REFRESH_TIMEOUT_MS || "300000",
    10,
  ) || 300000,
);
const viewPrsAckTotalRefreshTimeoutMs = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_ACK_TOTAL_REFRESH_TIMEOUT_MS || "480000",
    10,
  ) || 480000,
);
const viewPrsBackfillStatusTimeoutMs = Math.max(
  10 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_BACKFILL_STATUS_TIMEOUT_MS || "20000",
    10,
  ) || 20000,
);
const viewPrsBackfillActionTimeoutMs = Math.max(
  10 * 1000,
  Number.parseInt(
    process.env.VIEW_PRS_BACKFILL_ACTION_TIMEOUT_MS || "120000",
    10,
  ) || 120000,
);
const viewPrsPrDiffTimeoutMs = Math.max(
  30 * 1000,
  Number.parseInt(process.env.VIEW_PRS_PR_DIFF_TIMEOUT_MS || "120000", 10) ||
    120000,
);
const viewPrsPrDiffConcurrency = Math.max(
  0,
  Math.min(
    4,
    Number.parseInt(process.env.VIEW_PRS_PR_DIFF_CONCURRENCY || "2", 10) || 2,
  ),
);
const viewPrsViewerLoginCacheTtlMs = 5 * 60 * 1000;

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
};

const VIEW_PRS_PROGRESS_PREFIX = "__VIEW_PRS_PROGRESS__:";
const viewPrsActivePrCounts = new Map();

const syncSchedulerActivePrNumbers = () => {
  viewPrsSchedulerState.activePrNumbers = [...viewPrsActivePrCounts.keys()].sort(
    (left, right) => Number(left) - Number(right),
  );
};

const incrementActivePrNumber = (prNumber) => {
  const safePrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(safePrNumber)) {
    return;
  }

  const currentCount = viewPrsActivePrCounts.get(safePrNumber) || 0;
  viewPrsActivePrCounts.set(safePrNumber, currentCount + 1);
  syncSchedulerActivePrNumbers();
};

const decrementActivePrNumber = (prNumber) => {
  const safePrNumber = String(prNumber || "").trim();
  if (!/^\d+$/.test(safePrNumber)) {
    return;
  }

  const currentCount = viewPrsActivePrCounts.get(safePrNumber) || 0;
  if (currentCount <= 1) {
    viewPrsActivePrCounts.delete(safePrNumber);
  } else {
    viewPrsActivePrCounts.set(safePrNumber, currentCount - 1);
  }
  syncSchedulerActivePrNumbers();
};

const viewPrsProgressTracker = {
  onStart: (prNumber) => {
    incrementActivePrNumber(prNumber);
  },
  onEnd: (prNumber) => {
    decrementActivePrNumber(prNumber);
  },
  onRunDone: (runProgressCounts) => {
    if (!(runProgressCounts instanceof Map)) {
      return;
    }

    runProgressCounts.forEach((count, prNumber) => {
      for (let index = 0; index < count; index += 1) {
        decrementActivePrNumber(prNumber);
      }
    });
  },
};

const addSchedulerActivePrNumbers = (prNumbers) => {
  const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
  uniqueNumbers.forEach((prNumber) => {
    incrementActivePrNumber(prNumber);
  });
};

const removeSchedulerActivePrNumbers = (prNumbers) => {
  const uniqueNumbers = Array.isArray(prNumbers) ? [...new Set(prNumbers)] : [];
  uniqueNumbers.forEach((prNumber) => {
    decrementActivePrNumber(prNumber);
  });
};

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

let viewPrsWatchdogForceStopCount = 0;

const ACTION_LOG_MAX_ENTRIES = 500;

const appendActionLogEntry = (entry) => {
  try {
    fs.mkdirSync(path.dirname(viewPrsActionLogFile), { recursive: true });
    let entries = [];
    if (fs.existsSync(viewPrsActionLogFile)) {
      try {
        entries = JSON.parse(fs.readFileSync(viewPrsActionLogFile, "utf8"));
        if (!Array.isArray(entries)) entries = [];
      } catch (_parseError) {
        entries = [];
      }
    }
    entries.unshift(entry);
    if (entries.length > ACTION_LOG_MAX_ENTRIES) {
      entries = entries.slice(0, ACTION_LOG_MAX_ENTRIES);
    }
    fs.writeFileSync(
      viewPrsActionLogFile,
      JSON.stringify(entries, null, 2),
      "utf8",
    );
  } catch (_writeError) {
    // best-effort; never throw from a logging helper
  }
};

const readActionLog = () => {
  if (!fs.existsSync(viewPrsActionLogFile)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(viewPrsActionLogFile, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (_error) {
    return [];
  }
};

// Helper functions
const readJsonFileIfExists = (filePath, fallbackValue) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallbackValue;
  }
};

const readJsonFileIfExistsDetailed = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      value: null,
      parseError: null,
    };
  }

  try {
    return {
      exists: true,
      value: JSON.parse(fs.readFileSync(filePath, "utf8")),
      parseError: null,
    };
  } catch (error) {
    return {
      exists: true,
      value: null,
      parseError: error,
    };
  }
};

const readUserDefaults = () => {
  if (!fs.existsSync(viewPrsUserDefaultsFile)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(viewPrsUserDefaultsFile, "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const writeUserDefaults = (overrides) => {
  const data = isObject(overrides) ? overrides : {};
  fs.mkdirSync(path.dirname(viewPrsUserDefaultsFile), { recursive: true });
  fs.writeFileSync(viewPrsUserDefaultsFile, JSON.stringify(data, null, 2), "utf8");
};

const safeReadJsonFile = (filePath, fallbackValue = null) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallbackValue;
  }
};

const runViewPrsCommand = (
  command,
  args,
  maxBufferBytes = 10 * 1024 * 1024,
  options = {},
) =>
  new Promise((resolve, reject) => {
    const timeoutMs =
      Number.isFinite(Number(options?.timeoutMs)) &&
        Number(options?.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : 0;

    const maxBuffer =
      Number.isFinite(Number(maxBufferBytes)) && Number(maxBufferBytes) > 0
        ? Number(maxBufferBytes)
        : 10 * 1024 * 1024;

    const child = spawn(command, Array.isArray(args) ? args : [], {
      cwd: viewPrsDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GH_PAGER: "cat",
      },
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let didTimeout = false;
    let settled = false;
    let timeoutHandle = null;
    let forceKillTimeoutHandle = null;

    const forceStopProcessTree = () => {
      terminateProcessTree(child.pid, "SIGTERM");
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      forceKillTimeoutHandle = setTimeout(
        () => terminateProcessTree(child.pid, "SIGKILL"),
        1000,
      );
    };

    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      resolve(value);
    };

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      reject({
        error,
        stdout,
        stderr,
        command: `${command} ${Array.isArray(args) ? args.join(" ") : ""}`,
        didTimeout,
        timeoutMs,
      });
    };

    const appendChunk = (chunk, target) => {
      const chunkText = chunk.toString();
      const chunkBytes = Buffer.byteLength(chunkText);
      if (target === "stdout") {
        stdout += chunkText;
        stdoutBytes += chunkBytes;
        if (stdoutBytes > maxBuffer) {
          forceStopProcessTree();
          finishReject(new Error("stdout maxBuffer exceeded"));
        }
        return;
      }

      stderr += chunkText;
      stderrBytes += chunkBytes;
      if (stderrBytes > maxBuffer) {
        forceStopProcessTree();
        finishReject(new Error("stderr maxBuffer exceeded"));
      }
    };

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        didTimeout = true;
        forceStopProcessTree();
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => appendChunk(chunk, "stdout"));
    child.stderr.on("data", (chunk) => appendChunk(chunk, "stderr"));

    child.on("error", (error) => {
      finishReject(error);
    });

    child.on("close", (code, signal) => {
      if (didTimeout) {
        const timeoutSeconds = Math.round(timeoutMs / 1000);
        finishReject(
          new Error(
            timeoutSeconds > 0
              ? `Command timed out after ${timeoutSeconds}s`
              : "Command timed out",
          ),
        );
        return;
      }

      if (code !== 0) {
        finishReject(
          new Error(
            signal
              ? `Command terminated by ${signal}`
              : `Command exited with code ${code}`,
          ),
        );
        return;
      }

      finishResolve({ stdout, stderr });
    });
  });

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
    ...readJsonFileIfExists(prReviewsUsernamesFile, {}),
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
} = createViewPrsSchedulerHelpers({
  fs,
  console,
  parseTimestamp,
  toTrimmedString,
  isRepoSlug,
  parseRepoCsv,
  readViewPrsData: readViewPrsDataRef,
  defaultViewPrsRepo,
  viewPrsAutoIntervalMs,
  viewPrsManualCooldownMs,
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAckTotalRefreshTimeoutMs,
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  viewPrsLegacySchedulerFile,
});

const formatScriptFailureMessage = (
  failure,
  fallbackMessage = "Script failed",
) => {
  if (failure?.didTimeout === true) {
    const timeoutMs = Number(failure?.timeoutMs || 0);
    const timeoutSeconds = timeoutMs > 0 ? Math.round(timeoutMs / 1000) : null;
    return timeoutSeconds
      ? `Script timed out after ${timeoutSeconds}s`
      : "Script timed out";
  }
  return failure?.error?.message || fallbackMessage;
};

const terminateProcessTree = (pid, signal) => {
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) {
    return;
  }

  try {
    // Child processes run in their own process group, so kill the whole group.
    process.kill(-Number(pid), signal);
  } catch (_error) {
    try {
      process.kill(Number(pid), signal);
    } catch (_ignore) {
      // Best effort cleanup.
    }
  }
};

const runViewPrsBashCommand = (
  bashArgs,
  maxBufferBytes = 10 * 1024 * 1024,
  options = {},
) =>
  new Promise((resolve, reject) => {
    const timeoutMs =
      Number.isFinite(Number(options?.timeoutMs)) &&
        Number(options?.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : 0;

    const maxBuffer =
      Number.isFinite(Number(maxBufferBytes)) && Number(maxBufferBytes) > 0
        ? Number(maxBufferBytes)
        : 10 * 1024 * 1024;

    const command = `bash ${bashArgs.join(" ")}`;
    const progressTracker =
      options?.progressTracker && typeof options.progressTracker === "object"
        ? options.progressTracker
        : null;
    const child = spawn("bash", bashArgs, {
      cwd: viewPrsDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(options?.env || {}),
      },
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let didTimeout = false;
    let settled = false;
    let timeoutHandle = null;
    let forceKillTimeoutHandle = null;
    let forceStopLogged = false;
    let stdoutProgressRemainder = "";
    let stderrProgressRemainder = "";
    const runProgressCounts = new Map();

    const trackRunProgress = (action, prNumber) => {
      if (!progressTracker) {
        return;
      }

      if (action === "START") {
        const currentCount = runProgressCounts.get(prNumber) || 0;
        runProgressCounts.set(prNumber, currentCount + 1);
        if (typeof progressTracker.onStart === "function") {
          progressTracker.onStart(prNumber);
        }
        return;
      }

      const currentCount = runProgressCounts.get(prNumber) || 0;
      if (currentCount > 1) {
        runProgressCounts.set(prNumber, currentCount - 1);
      } else {
        runProgressCounts.delete(prNumber);
      }
      if (typeof progressTracker.onEnd === "function") {
        progressTracker.onEnd(prNumber);
      }
    };

    const parseProgressLine = (line) => {
      const safeLine = String(line || "").trim();
      if (!safeLine.startsWith(VIEW_PRS_PROGRESS_PREFIX)) {
        return false;
      }

      const progressParts = safeLine.slice(VIEW_PRS_PROGRESS_PREFIX.length).split(":");
      const action = String(progressParts[0] || "").trim();
      const prNumber = String(progressParts[1] || "").trim();
      if (!["START", "END"].includes(action) || !/^\d+$/.test(prNumber)) {
        return false;
      }

      trackRunProgress(action, prNumber);
      return true;
    };

    const sanitizeProgressChunk = (chunkText, streamName) => {
      const isStdout = streamName === "stdout";
      const remainder = isStdout ? stdoutProgressRemainder : stderrProgressRemainder;
      const combined = `${remainder}${chunkText}`;
      const lines = combined.split(/\r?\n/);
      const nextRemainder = lines.pop() || "";
      if (isStdout) {
        stdoutProgressRemainder = nextRemainder;
      } else {
        stderrProgressRemainder = nextRemainder;
      }

      let sanitized = "";
      lines.forEach((line) => {
        if (parseProgressLine(line)) {
          return;
        }
        sanitized += `${line}\n`;
      });
      return sanitized;
    };

    const flushProgressRemainder = (streamName) => {
      const isStdout = streamName === "stdout";
      const remainder = isStdout ? stdoutProgressRemainder : stderrProgressRemainder;
      if (isStdout) {
        stdoutProgressRemainder = "";
      } else {
        stderrProgressRemainder = "";
      }
      if (!remainder) {
        return;
      }

      if (!parseProgressLine(remainder)) {
        if (isStdout) {
          stdout += remainder;
          stdoutBytes += Buffer.byteLength(remainder);
        } else {
          stderr += remainder;
          stderrBytes += Buffer.byteLength(remainder);
        }
      }
    };

    const forceStopProcessTree = (reason) => {
      if (!forceStopLogged) {
        forceStopLogged = true;
        viewPrsWatchdogForceStopCount += 1;
        const nowIso = new Date().toISOString();
        const timeoutSec = timeoutMs > 0 ? Math.round(timeoutMs / 1000) : 0;
        console.warn(
          `[view-prs][watchdog] force-stop #${viewPrsWatchdogForceStopCount} at ${nowIso} reason=${reason} timeoutSec=${timeoutSec} pid=${child.pid} command="${command}"`,
        );
      }

      terminateProcessTree(child.pid, "SIGTERM");
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      forceKillTimeoutHandle = setTimeout(
        () => terminateProcessTree(child.pid, "SIGKILL"),
        1000,
      );
    };

    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      flushProgressRemainder("stdout");
      flushProgressRemainder("stderr");
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      if (
        progressTracker &&
        typeof progressTracker.onRunDone === "function"
      ) {
        progressTracker.onRunDone(runProgressCounts);
      }
      resolve(value);
    };

    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      flushProgressRemainder("stdout");
      flushProgressRemainder("stderr");
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (forceKillTimeoutHandle) {
        clearTimeout(forceKillTimeoutHandle);
      }
      if (
        progressTracker &&
        typeof progressTracker.onRunDone === "function"
      ) {
        progressTracker.onRunDone(runProgressCounts);
      }
      reject({
        error,
        stdout,
        stderr,
        command,
        didTimeout,
        timeoutMs,
      });
    };

    const appendChunk = (chunk, target) => {
      const chunkText = chunk.toString();
      if (target === "stdout") {
        const sanitizedChunk = sanitizeProgressChunk(chunkText, target);
        stdout += sanitizedChunk;
        stdoutBytes += Buffer.byteLength(sanitizedChunk);
        if (stdoutBytes > maxBuffer) {
          forceStopProcessTree("stdout-maxBuffer");
          finishReject(new Error("stdout maxBuffer exceeded"));
        }
        return;
      }

      const sanitizedChunk = sanitizeProgressChunk(chunkText, target);
      stderr += sanitizedChunk;
      stderrBytes += Buffer.byteLength(sanitizedChunk);
      if (stderrBytes > maxBuffer) {
        forceStopProcessTree("stderr-maxBuffer");
        finishReject(new Error("stderr maxBuffer exceeded"));
      }
    };

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        didTimeout = true;
        forceStopProcessTree("timeout");
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => appendChunk(chunk, "stdout"));
    child.stderr.on("data", (chunk) => appendChunk(chunk, "stderr"));

    child.on("error", (error) => {
      finishReject(error);
    });

    child.on("close", (code, signal) => {
      if (didTimeout) {
        const timeoutSeconds = Math.round(timeoutMs / 1000);
        finishReject(
          new Error(
            timeoutSeconds > 0
              ? `Command timed out after ${timeoutSeconds}s`
              : "Command timed out",
          ),
        );
        return;
      }

      if (code !== 0) {
        finishReject(
          new Error(
            signal
              ? `Command terminated by ${signal}`
              : `Command exited with code ${code}`,
          ),
        );
        return;
      }

      finishResolve({ stdout, stderr, command });
    });
  });

const runViewPrsScript = (
  scriptArgs,
  maxBufferBytes = 10 * 1024 * 1024,
  options = {},
) => {
  const trackSchedulerPrProgress =
    options?.trackSchedulerPrProgress !== false;
  const userProgressTracker = options?.progressTracker || null;
  const schedulerProgressTracker = trackSchedulerPrProgress
    ? viewPrsProgressTracker
    : null;
  const progressTracker =
    userProgressTracker && schedulerProgressTracker
      ? {
          onStart: (prNumber) => {
            schedulerProgressTracker.onStart?.(prNumber);
            userProgressTracker.onStart?.(prNumber);
          },
          onEnd: (prNumber) => {
            schedulerProgressTracker.onEnd?.(prNumber);
            userProgressTracker.onEnd?.(prNumber);
          },
          onRunDone: (runProgressCounts) => {
            schedulerProgressTracker.onRunDone?.(runProgressCounts);
            userProgressTracker.onRunDone?.(runProgressCounts);
          },
        }
      : userProgressTracker || schedulerProgressTracker;

  return runViewPrsBashCommand(scriptArgs, maxBufferBytes, {
    ...options,
    env: {
      ...(options?.env || {}),
      VIEW_PRS_PROGRESS_MARKERS: trackSchedulerPrProgress ? "1" : "0",
    },
    progressTracker,
  });
};

const callRunViewPrsScript = (...args) =>
  (module.exports.runViewPrsScript || runViewPrsScript)(...args);

const callGetDependencyStatus = () =>
  (module.exports.getDependencyStatus || getDependencyStatus)();

const runViewPrsShellScript = (
  scriptName,
  scriptArgs = [],
  maxBufferBytes = 1024 * 1024,
  options = {},
) =>
  runViewPrsBashCommand([scriptName, ...scriptArgs], maxBufferBytes, options);

const listMergedPrCandidates = async ({ repo, limit = 100 }) => {
  const safeRepo = toTrimmedString(repo);
  const safeLimit = Math.max(
    1,
    Math.min(200, Number.parseInt(String(limit), 10) || 100),
  );

  if (!isRepoSlug(safeRepo)) {
    throw new Error(`Invalid repo: ${safeRepo}`);
  }

  const result = await runViewPrsBashCommand(
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

const isCommandAvailable = (cmd) => {
  const check = spawnSync("bash", ["-lc", `command -v ${cmd}`], {
    stdio: "ignore",
  });
  return check.status === 0;
};

const getDependencyStatus = () => {
  const commands = {};
  for (const cmd of requiredCommands) {
    commands[cmd] = isCommandAvailable(cmd);
  }

  const packages = {};
  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
      packages[pkg] = true;
    } catch (_error) {
      packages[pkg] = false;
    }
  }

  const missingCommands = Object.entries(commands)
    .filter(([, available]) => !available)
    .map(([name]) => name);

  const missingPackages = Object.entries(packages)
    .filter(([, available]) => !available)
    .map(([name]) => name);

  const missing = [
    ...missingCommands,
    ...missingPackages.map((pkg) => `npm:${pkg}`),
  ];

  return {
    ok: missingCommands.length === 0 && missingPackages.length === 0,
    commands,
    packages,
    missingCommands,
    missingPackages,
    missing,
  };
};

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
    const byPrNumber = Object.fromEntries(
      Object.entries(byPrNumberRaw)
        .filter(([, entry]) => !isViewPrsFixtureRow(entry))
        .map(([prNumber, entry]) => {
          if (!isObject(entry)) {
            return [prNumber, entry];
          }
          const hydratedEntry = hydrateViewPrsEntryWithDetail(entry);
          const notes = mergedUserState.notesByPrNumber[prNumber];
          if (!notes) {
            return [prNumber, hydratedEntry];
          }
          return [prNumber, { ...hydratedEntry, notes }];
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
const runViewPrsAutoRefresh = async ({ skipCooldownChecks = false } = {}) => {
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
    const reposToRefresh = getViewPrsAutoRefreshRepos();
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
        addSchedulerActivePrNumbers(seededPrNumbers);
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
        removeSchedulerActivePrNumbers(seededPrNumbers);
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

// Create and configure the Express app
const createViewPrsApp = () => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(viewPrsUiDir));

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

  // Legacy compatibility route for UI files
  app.get(["/", "/index.html"], (_req, res) => {
    res.sendFile(viewPrsUiIndexFile);
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
    appendActionLogEntry,
    readViewPrsData,
    enqueuePrDiffRefreshForData,
    formatScriptFailureMessage,
    viewPrsSchedulerState,
    resetViewPrsAutoRefreshFailureState,
    runViewPrsAutoRefresh,
    buildAckRefreshBudgetSkipErrors,
    isRepoSlug,
    listMergedPrCandidates,
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
  runViewPrsAutoRefresh();
  return setInterval(runViewPrsAutoRefresh, viewPrsAutoIntervalMs);
};

module.exports = {
  // Main app and scheduler
  createViewPrsApp,
  initializeScheduler,
  runViewPrsAutoRefresh,
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
  prReviewsUsernamesFile,
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
  viewPrsAutoCircuitFailureThreshold,
  viewPrsAutoCircuitCooldownMs,
  viewPrsAutoScriptTimeoutMs,
  viewPrsManualScriptTimeoutMs,
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
  runViewPrsShellScript,
  parseBackfillCommandOutput,
  getBackfillLogTail,
  getViewPrsBackfillPublicState,
  runViewPrsBackfillAction,
  isCommandAvailable,
  getDependencyStatus,
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
  getPrDiffCacheFilePath,
  getPrDiffCommitFingerprint,
  readPrDiffCache,
  syncPrDiffForEntry,
  enqueuePrDiffRefresh,
  enqueuePrDiffRefreshForData,
};
