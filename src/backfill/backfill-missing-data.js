#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const Ajv2020 = require("ajv/dist/2020");
const {
  backupStamp,
  isObject,
  normalizeNoteStories,
  normalizeNotes,
  normalizePerRepoMap,
  normalizeViewPrsAuthorComments,
  normalizeViewPrsUserState,
} = require("../server/helpers/view-prs-data-helpers.js");
const { createFileIoHelpers } = require("../server/helpers/file-io-helpers.js");
const { createViewPrsStateStorage } = require("../server/storage/view-prs-state-storage.js");
const { enforceProtectedWritePolicy } = require("../server/state-write-policy.js");

// The project root: the same data/, src/schema/ and src/script/ locations
// the server uses (src/server/config/app-config.js).
const viewPrsDir = path.resolve(__dirname, "..", "..");
const schemaPathDefault = path.join(
  viewPrsDir,
  "src",
  "schema",
  "check-open-pr-updates.data.schema.json",
);
const dataPathDefault = path.join(
  viewPrsDir,
  "data",
  "check-open-pr-updates.data.json",
);
const userStatePathDefault = path.join(
  viewPrsDir,
  "data",
  "check-open-pr-updates.user-state.json",
);
const backupDirDefault = path.join(viewPrsDir, "data", "backups");
const refreshScriptPathDefault = path.join(
  viewPrsDir,
  "src",
  "script",
  "check-open-pr-updates.sh",
);

const buildDefaultOptions = () => ({
  schemaPath: schemaPathDefault,
  dataPath: dataPathDefault,
  userStatePath: userStatePathDefault,
  backupDir: backupDirDefault,
  refreshScriptPath: refreshScriptPathDefault,
  migrateOnly: false,
  maxPrs: 25,
  delayMs: 2500,
  jobs: 1,
  concurrency: 2,
  dryRun: false,
  repo: "",
  maxAgeDays: 0,
});

const getSectionPriority = (sectionRaw) => {
  const section = String(sectionRaw || "").trim().toLowerCase();
  if (section === "open") return 0;
  if (section === "draft") return 1;
  if (section === "closed") return 2;
  if (section === "merged") return 3;
  return 4;
};

const parseArgs = (argv, defaults = buildDefaultOptions()) => {
  const options = { ...defaults };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--migrate-only") {
      options.migrateOnly = true;
      continue;
    }
    // Override paths are relative to the current directory.
    if (arg === "--schema") {
      options.schemaPath = path.resolve(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--data") {
      options.dataPath = path.resolve(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--user-state") {
      options.userStatePath = path.resolve(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--backup-dir") {
      options.backupDir = path.resolve(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--script") {
      options.refreshScriptPath = path.resolve(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--max-prs") {
      options.maxPrs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--delay-ms") {
      options.delayMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--jobs") {
      options.jobs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--concurrency") {
      options.concurrency = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--repo") {
      options.repo = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--max-age-days") {
      options.maxAgeDays = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node backfill-missing-data.js [options]

First converts notes saved in the old stories format (separate rallyStories/
rallyLinks lists) to \`stories: [{ name, url }]\` in the user state and data
files (every note: notes are stored by PR number, not repo, so --repo
doesn't limit this), then refreshes stale or schema-invalid PR rows.

Options:
  --dry-run                Only report what would change, do not write or refresh
  --migrate-only           Only convert old-format stories, skip the PR refresh
  --repo <owner/name>      Only refresh rows for a specific repo (not the stories conversion)
  --max-prs <n>            Max PR rows to refresh this run (default: 25)
  --delay-ms <ms>          Delay between refreshes (default: 2500)
  --jobs <n>               Pass through to check-open-pr-updates.sh --jobs (default: 1)
  --concurrency <n>        Number of PR refresh workers to run in parallel (default: 2)
  --max-age-days <days>    Also refresh rows older than this age in days (default: 0 disabled)
  --schema <path>          Override schema file path
  --data <path>            Override data file path
  --user-state <path>      Override user state file path
  --backup-dir <path>      Override where file backups are written
  --script <path>          Override refresh script path`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.maxPrs) || options.maxPrs < 1) {
    throw new Error(`Invalid --max-prs value: ${options.maxPrs}`);
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error(`Invalid --delay-ms value: ${options.delayMs}`);
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1) {
    throw new Error(`Invalid --jobs value: ${options.jobs}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error(`Invalid --concurrency value: ${options.concurrency}`);
  }
  if (!Number.isFinite(options.maxAgeDays) || options.maxAgeDays < 0) {
    throw new Error(`Invalid --max-age-days value: ${options.maxAgeDays}`);
  }

  return options;
};

const collectBackfillCandidates = ({
  byPrNumber,
  validateEntry,
  repo = "",
  maxAgeDays = 0,
  nowMs = Date.now(),
}) => {
  const cutoffMs =
    maxAgeDays > 0 ? nowMs - maxAgeDays * 24 * 60 * 60 * 1000 : 0;

  const candidates = [];

  for (const [prNumber, entry] of Object.entries(byPrNumber || {})) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (repo && entry.repo !== repo) {
      continue;
    }

    const reasons = [];
    const valid = validateEntry(entry);

    if (!valid) {
      const firstError = (validateEntry.errors || [])[0];
      if (firstError) {
        reasons.push(
          `schema:${firstError.instancePath || "/"} ${firstError.message || "invalid"}`,
        );
      } else {
        reasons.push("schema:invalid");
      }
    }

    if (cutoffMs > 0) {
      const updatedAt = String(entry.updatedAt || "");
      const updatedAtMs = Date.parse(updatedAt);
      if (!Number.isFinite(updatedAtMs) || updatedAtMs < cutoffMs) {
        reasons.push(`age>${maxAgeDays}d`);
      }
    }

    if (!reasons.length) {
      continue;
    }

    candidates.push({
      prNumber,
      repo: String(entry.repo || ""),
      section: String(entry.section || ""),
      updatedAt: String(entry.updatedAt || ""),
      reasons,
    });
  }

  candidates.sort((a, b) => {
    const priorityDelta = getSectionPriority(a.section) - getSectionPriority(b.section);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  return candidates;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const LEGACY_STORY_KEYS = ["rallyStories", "rallyLinks"];

// A note in the old stories format (rallyStories/rallyLinks) converted to
// `stories`, the same way the server reads it (normalizeNoteStories); null
// when the note has neither old key. Other fields and the key order are
// kept, `stories` taking the first old key's place.
const migrateNoteStories = (notes) => {
  if (
    !isPlainObject(notes) ||
    !LEGACY_STORY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(notes, key))
  ) {
    return null;
  }
  const stories = normalizeNoteStories(notes);
  const migrated = {};
  for (const [key, value] of Object.entries(notes)) {
    if (LEGACY_STORY_KEYS.includes(key) || key === "stories") {
      if (!Object.prototype.hasOwnProperty.call(migrated, "stories")) {
        migrated.stories = stories;
      }
      continue;
    }
    migrated[key] = value;
  }
  return migrated;
};

// Converts, in place, every old-format note in the user state
// (notesByPrNumber) and any notes still on data-file entries (saved before
// notes moved to the user state). Returns the PR numbers changed in each.
const migrateLegacyStories = ({ userState, data }) => {
  const userStatePrNumbers = [];
  const dataPrNumbers = [];
  const notesByPrNumber = isPlainObject(userState?.notesByPrNumber) ? userState.notesByPrNumber : {};
  for (const [prNumber, notes] of Object.entries(notesByPrNumber)) {
    const migrated = migrateNoteStories(notes);
    if (migrated) {
      notesByPrNumber[prNumber] = migrated;
      userStatePrNumbers.push(prNumber);
    }
  }
  const byPrNumber = isPlainObject(data?.byPrNumber) ? data.byPrNumber : {};
  for (const [prNumber, entry] of Object.entries(byPrNumber)) {
    const migrated = migrateNoteStories(entry?.notes);
    if (migrated) {
      entry.notes = migrated;
      dataPrNumbers.push(prNumber);
    }
  }
  return { userStatePrNumbers, dataPrNumbers };
};

// The lock directory check-open-pr-updates.sh uses for a state file (e.g.
// check-open-pr-updates.data.json -> check-open-pr-updates.data.lock; the
// server also takes the data one for its label patch), so this never
// interleaves with their read-modify-write. The server's own user state
// writes (notes saves) don't take a lock - see migrateLegacyStoriesInFiles.
const getLockDir = (filePath) => filePath.replace(/\.json$/, ".lock");

// Why a lock is still held, for the error: its age and the holder the shell
// recorded in lock-info. A lock left by a killed run is not removed here:
// the shell does that by checking the holder's pid, but under Git Bash that
// is an MSYS pid Node can't check, so a live lock could look abandoned.
const describeHeldLock = (lockDir) => {
  const parts = [];
  try {
    const ageSeconds = Math.round((Date.now() - fs.statSync(lockDir).mtimeMs) / 1000);
    parts.push(`held for ${ageSeconds}s`);
  } catch (_error) {
    // It may have just been released.
  }
  try {
    const info = fs.readFileSync(path.join(lockDir, "lock-info"), "utf8");
    const pid = (info.match(/^pid=(.*)$/m) || [])[1];
    if (pid) {
      parts.push(`by pid ${pid.trim()}`);
    }
  } catch (_error) {
    // No lock-info (e.g. held by the server or another backfill run).
  }
  return parts.length ? ` (${parts.join(" ")})` : "";
};

const withFileLock = async (filePath, run, { maxWaitMs = 5000 } = {}) => {
  const lockDir = getLockDir(filePath);
  const deadlineMs = Date.now() + maxWaitMs;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadlineMs) {
        throw new Error(
          `Unable to acquire lock ${lockDir}${describeHeldLock(lockDir)}. Another run may be writing ${path.basename(filePath)}; if no check-open-pr-updates.sh run is in progress, the lock was left by one that stopped early and the folder can be removed.`,
          { cause: error },
        );
      }
      await wait(50);
    }
  }
  try {
    return await run();
  } finally {
    try {
      fs.rmdirSync(lockDir);
    } catch (_error) {
      // Best effort.
    }
  }
};

// Writes through the server's own state storage, so its protected-write
// policy applies (it refuses a write that would clear or drastically shrink
// a file) and each file is first backed up into backupDir (pruned to
// VIEW_PRS_BACKUP_RETENTION per file and tag, as the server does).
const createStateWriter = ({ dataPath, userStatePath, backupDir }) => {
  const { readJsonFileIfExists, readJsonFileIfExistsDetailed } = createFileIoHelpers({ fs, path });
  const { writeJsonFileWithBackup } = createViewPrsStateStorage({
    fs,
    enforceProtectedWritePolicy,
    viewPrsBackupRetention: Math.max(
      1,
      Number.parseInt(process.env.VIEW_PRS_BACKUP_RETENTION || "50", 10) || 50,
    ),
    viewPrsBackupDir: backupDir,
    viewPrsDataFile: dataPath,
    viewPrsUserStateFile: userStatePath,
    // Not written here.
    viewPrsAuthorCommentsFile: "",
    readJsonFileIfExists,
    readJsonFileIfExistsDetailed,
    normalizeViewPrsUserState,
    normalizeViewPrsAuthorComments,
    normalizeNotes,
    normalizePerRepoMap,
    isObject,
    backupStamp,
  });
  return (filePath, value) => writeJsonFileWithBackup(filePath, value, "stories-migration");
};

// Converts old-format stories in the user state and data files (each read
// and written under its lock; a missing file is skipped). With dryRun,
// only reports. Returns the PR numbers changed in each file.
//
// The lock doesn't cover the dashboard's own notes saves, which write the
// user state without one. So the file is read again just before writing,
// and if it changed in the meantime (e.g. a note was saved) the conversion
// is redone on the fresh copy rather than overwriting that save.
const MAX_CONVERT_ATTEMPTS = 3;

const migrateLegacyStoriesInFiles = async ({
  userStatePath,
  dataPath,
  backupDir,
  dryRun = false,
  log = console.log,
  lockWaitMs = 5000,
  readText = (filePath) => fs.readFileSync(filePath, "utf8"),
}) => {
  const result = { userStatePrNumbers: [], dataPrNumbers: [] };
  const writeStateFile = createStateWriter({ dataPath, userStatePath, backupDir });
  const files = [
    { filePath: userStatePath, key: "userStatePrNumbers", label: "user state" },
    { filePath: dataPath, key: "dataPrNumbers", label: "data file" },
  ];
  for (const { filePath, key, label } of files) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    await withFileLock(filePath, async () => {
      for (let attempt = 1; attempt <= MAX_CONVERT_ATTEMPTS; attempt += 1) {
        const before = readText(filePath);
        const value = JSON.parse(before);
        const changed = migrateLegacyStories(
          key === "userStatePrNumbers" ? { userState: value } : { data: value },
        )[key];
        result[key] = changed;
        if (!changed.length || dryRun) {
          if (changed.length) {
            log(`[backfill] would convert old-format stories in the ${label} for PR(s): ${changed.join(", ")}`);
          }
          return;
        }
        if (readText(filePath) !== before) {
          continue;
        }
        log(`[backfill] converting old-format stories in the ${label} for PR(s): ${changed.join(", ")}`);
        writeStateFile(filePath, value);
        return;
      }
      throw new Error(
        `The ${label} kept changing while converting its stories; nothing was written. Run again when the dashboard is idle.`,
      );
    }, { maxWaitMs: lockWaitMs });
  }
  if (!result.userStatePrNumbers.length && !result.dataPrNumbers.length) {
    log("[backfill] no old-format stories found");
  }
  return result;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runWithConcurrency = async ({
  items,
  concurrency,
  delayMs,
  processItem,
}) => {
  const totalItems = Array.isArray(items) ? items.length : 0;
  if (totalItems === 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, totalItems));

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= totalItems) {
        return;
      }

      const item = items[currentIndex];
      await processItem(item, currentIndex, totalItems);

      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  };

  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);
};

const runRefresh = ({ refreshScriptPath, repo, prNumber, jobs }) =>
  new Promise((resolve) => {
    const args = [
      refreshScriptPath,
      "--repo",
      repo,
      "--pr",
      String(prNumber),
      "--open",
      "none",
      "--quiet",
      "--show-reason",
      "--jobs",
      String(jobs),
    ];

    // From the project root, as the server runs it.
    const child = spawn("bash", args, {
      cwd: viewPrsDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  await migrateLegacyStoriesInFiles({
    userStatePath: options.userStatePath,
    dataPath: options.dataPath,
    backupDir: options.backupDir,
    dryRun: options.dryRun,
  });
  if (options.migrateOnly) {
    return;
  }

  if (!fs.existsSync(options.schemaPath)) {
    throw new Error(`Schema file not found: ${options.schemaPath}`);
  }
  if (!fs.existsSync(options.dataPath)) {
    throw new Error(`Data file not found: ${options.dataPath}`);
  }
  if (!fs.existsSync(options.refreshScriptPath)) {
    throw new Error(`Refresh script not found: ${options.refreshScriptPath}`);
  }

  const schema = readJson(options.schemaPath);
  const data = readJson(options.dataPath);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateEntry = ajv.compile({
    $ref: "#/$defs/byPrEntry",
    $defs: schema.$defs || {},
  });

  const byPrNumber =
    data && typeof data.byPrNumber === "object" && data.byPrNumber !== null
      ? data.byPrNumber
      : {};

  const candidates = collectBackfillCandidates({
    byPrNumber,
    validateEntry,
    repo: options.repo,
    maxAgeDays: options.maxAgeDays,
  });

  console.log(
    `[backfill] found ${candidates.length} candidate PR rows${options.repo ? ` for repo ${options.repo}` : ""}`,
  );

  if (!candidates.length) {
    return;
  }

  const toProcess = candidates.slice(0, options.maxPrs);
  console.log(
    `[backfill] processing ${toProcess.length} row(s) (max-prs=${options.maxPrs}, delay-ms=${options.delayMs}, jobs=${options.jobs}, concurrency=${options.concurrency}, dry-run=${options.dryRun})`,
  );

  await runWithConcurrency({
    items: toProcess,
    concurrency: options.concurrency,
    delayMs: options.delayMs,
    processItem: async (item, index, total) => {
      const label = `${index + 1}/${total} #${item.prNumber} ${item.repo}`;
      const sectionLabel = String(item.section || "unknown").toUpperCase();
      console.log(
        `[backfill] ${label} section=${sectionLabel} reasons=${item.reasons.join(" | ")}`,
      );

      if (options.dryRun) {
        return;
      }

      const result = await runRefresh({
        refreshScriptPath: options.refreshScriptPath,
        repo: item.repo,
        prNumber: item.prNumber,
        jobs: options.jobs,
      });

      if (!result.ok) {
        console.error(
          `[backfill] refresh failed for #${item.prNumber} (exit ${result.code})`,
        );
        if (result.stderr.trim()) {
          console.error(result.stderr.trim());
        }
      }
    },
  });

  if (options.dryRun) {
    console.log("[backfill] dry run complete (no refresh executed)");
  } else {
    console.log("[backfill] refresh run complete");
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[backfill] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  buildDefaultOptions,
  collectBackfillCandidates,
  migrateLegacyStories,
  migrateLegacyStoriesInFiles,
  migrateNoteStories,
  parseArgs,
};
