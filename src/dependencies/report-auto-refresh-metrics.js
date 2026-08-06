#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const DEFAULT_ACTION_LOG_FILE = path.join(projectRoot, "data", "action-log.json");

const percentile = (values, percentileRank) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clampedRank = Math.min(Math.max(percentileRank, 0), 1);
  const index = Math.floor(clampedRank * (sorted.length - 1));
  return sorted[index];
};

const summarizeNumericValues = (values) => {
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      avg: null,
      p50: null,
      p95: null,
    };
  }

  const sum = numericValues.reduce((total, value) => total + value, 0);

  return {
    count: numericValues.length,
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
    avg: sum / numericValues.length,
    p50: percentile(numericValues, 0.5),
    p95: percentile(numericValues, 0.95),
  };
};

const toPrettyMs = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  const rounded = Math.round(numericValue);
  const seconds = rounded / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = seconds / 60;
  return `${minutes.toFixed(2)}m`;
};

const parseArgs = (argv) => {
  const options = {
    actionLogFile: DEFAULT_ACTION_LOG_FILE,
    limit: 10,
    includeFailures: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      options.actionLogFile = path.resolve(projectRoot, argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--include-failures") {
      options.includeFailures = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error(`Invalid --limit value: ${options.limit}`);
  }

  return options;
};

const readActionLogEntries = ({
  actionLogFile = DEFAULT_ACTION_LOG_FILE,
  fsImpl = fs,
} = {}) => {
  if (!fsImpl.existsSync(actionLogFile)) {
    throw new Error(`Action log file not found: ${actionLogFile}`);
  }

  const raw = JSON.parse(fsImpl.readFileSync(actionLogFile, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Action log file content is not an array");
  }

  return raw;
};

const buildAutoRefreshMetricsSummary = ({
  entries,
  limit,
  includeFailures,
}) => {
  const selectedEntries = entries
    .filter((entry) => String(entry?.action || "") === "auto-refresh")
    .filter((entry) => includeFailures || entry?.ok === true)
    .slice(0, limit);

  const durationValues = selectedEntries.map((entry) => entry?.durationMs);
  const firstProgressValues = selectedEntries.map(
    (entry) => entry?.detail?.timeToFirstPrProgressMs,
  );
  const repoDurationValues = selectedEntries.flatMap((entry) =>
    Array.isArray(entry?.detail?.repoMetrics)
      ? entry.detail.repoMetrics.map((repoMetric) => repoMetric?.durationMs)
      : [],
  );
  const repoQueueWaitValues = selectedEntries.flatMap((entry) =>
    Array.isArray(entry?.detail?.repoMetrics)
      ? entry.detail.repoMetrics.map((repoMetric) => repoMetric?.queueWaitMs)
      : [],
  );

  return {
    runCount: selectedEntries.length,
    includeFailures,
    limit,
    durationMs: summarizeNumericValues(durationValues),
    timeToFirstPrProgressMs: summarizeNumericValues(firstProgressValues),
    perRepoDurationMs: summarizeNumericValues(repoDurationValues),
    perRepoQueueWaitMs: summarizeNumericValues(repoQueueWaitValues),
    latestRunAt:
      selectedEntries.length > 0
        ? selectedEntries[0]?.triggeredAt || null
        : null,
  };
};

const printSummary = (summary, logger = console) => {
  logger.log("Auto-refresh metrics summary");
  logger.log(
    `Runs analyzed: ${summary.runCount} (limit=${summary.limit}, includeFailures=${summary.includeFailures})`,
  );
  logger.log(`Latest run: ${summary.latestRunAt || "-"}`);
  logger.log("");

  const printStatBlock = (label, stats) => {
    logger.log(label);
    logger.log(`  count: ${stats.count}`);
    logger.log(`  avg: ${toPrettyMs(stats.avg)}`);
    logger.log(`  p50: ${toPrettyMs(stats.p50)}`);
    logger.log(`  p95: ${toPrettyMs(stats.p95)}`);
    logger.log(`  min: ${toPrettyMs(stats.min)}`);
    logger.log(`  max: ${toPrettyMs(stats.max)}`);
  };

  printStatBlock("Run duration", summary.durationMs);
  logger.log("");
  printStatBlock("Time to first PR progress", summary.timeToFirstPrProgressMs);
  logger.log("");
  printStatBlock("Per-repo duration", summary.perRepoDurationMs);
  logger.log("");
  printStatBlock("Per-repo queue wait", summary.perRepoQueueWaitMs);
};

const runAutoRefreshMetricsReport = (argv, logger = console) => {
  const options = parseArgs(argv);
  if (options.help) {
    logger.log(`Usage: node src/dependencies/report-auto-refresh-metrics.js [options]

Options:
  --limit <n>             Number of most recent auto-refresh runs to analyze (default: 10)
  --include-failures      Include failed auto-refresh runs
  --file <path>           Override action-log file path
  --json                  Print JSON summary only
  -h, --help              Show this help`);
    return 0;
  }

  const entries = readActionLogEntries({ actionLogFile: options.actionLogFile });
  const summary = buildAutoRefreshMetricsSummary({
    entries,
    limit: options.limit,
    includeFailures: options.includeFailures,
  });

  if (options.json) {
    logger.log(JSON.stringify(summary, null, 2));
    return 0;
  }

  printSummary(summary, logger);
  return 0;
};

if (require.main === module) {
  try {
    process.exit(runAutoRefreshMetricsReport(process.argv.slice(2)));
  } catch (error) {
    console.error(`[report:auto-refresh] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  readActionLogEntries,
  buildAutoRefreshMetricsSummary,
  runAutoRefreshMetricsReport,
};
