#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const Ajv2020 = require("ajv/dist/2020");

const viewPrsDir = __dirname;
const schemaPathDefault = path.join(
  viewPrsDir,
  "check-open-pr-updates.data.schema.json",
);
const dataPathDefault = path.join(
  viewPrsDir,
  "data",
  "check-open-pr-updates.data.json",
);
const refreshScriptPathDefault = path.join(
  viewPrsDir,
  "check-open-pr-updates.sh",
);

const buildDefaultOptions = () => ({
  schemaPath: schemaPathDefault,
  dataPath: dataPathDefault,
  refreshScriptPath: refreshScriptPathDefault,
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
    if (arg === "--schema") {
      options.schemaPath = path.resolve(viewPrsDir, argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--data") {
      options.dataPath = path.resolve(viewPrsDir, argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--script") {
      options.refreshScriptPath = path.resolve(viewPrsDir, argv[i + 1] || "");
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

Options:
  --dry-run                Only report stale/missing rows, do not refresh
  --repo <owner/name>      Only refresh rows for a specific repo
  --max-prs <n>            Max PR rows to refresh this run (default: 25)
  --delay-ms <ms>          Delay between refreshes (default: 2500)
  --jobs <n>               Pass through to check-open-pr-updates.sh --jobs (default: 1)
  --concurrency <n>        Number of PR refresh workers to run in parallel (default: 2)
  --max-age-days <days>    Also refresh rows older than this age in days (default: 0 disabled)
  --schema <path>          Override schema file path
  --data <path>            Override data file path
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
  parseArgs,
};
