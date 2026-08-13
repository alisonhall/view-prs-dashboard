const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseArgs,
  readActionLogEntries,
  buildAutoRefreshMetricsSummary,
  runAutoRefreshMetricsReport,
} = require("../report-auto-refresh-metrics.js");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-auto-refresh-report-"));

const makeLogger = () => ({
  lines: [],
  log(message) {
    this.lines.push(String(message));
  },
});

describe("report-auto-refresh-metrics parseArgs", () => {
  test("parses valid arguments", () => {
    const options = parseArgs([
      "--limit",
      "7",
      "--include-failures",
      "--json",
    ]);

    expect(options.limit).toBe(7);
    expect(options.includeFailures).toBe(true);
    expect(options.json).toBe(true);
  });

  test("throws on unknown arguments", () => {
    expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
  });

  test("throws on invalid limit", () => {
    expect(() => parseArgs(["--limit", "0"])).toThrow(
      "Invalid --limit value: 0",
    );
  });

  test("resolves custom file path", () => {
    const options = parseArgs(["--file", "data/custom-action-log.json"]);
    expect(path.isAbsolute(options.actionLogFile)).toBe(true);
    expect(options.actionLogFile.endsWith("data/custom-action-log.json")).toBe(
      true,
    );
  });
});

describe("report-auto-refresh-metrics readActionLogEntries", () => {
  test("throws when action log file is missing", () => {
    expect(() =>
      readActionLogEntries({ actionLogFile: "/tmp/definitely-not-present.json" }),
    ).toThrow("Action log file not found");
  });

  test("throws when file is not an array", () => {
    const tempDir = makeTempDir();
    const actionLogFile = path.join(tempDir, "action-log.json");
    fs.writeFileSync(actionLogFile, JSON.stringify({ bad: true }), "utf8");

    expect(() => readActionLogEntries({ actionLogFile })).toThrow(
      "Action log file content is not an array",
    );
  });
});

describe("report-auto-refresh-metrics summary", () => {
  test("summarizes recent successful runs and nested repo metrics", () => {
    const entries = [
      {
        action: "auto-refresh",
        ok: true,
        durationMs: 1000,
        triggeredAt: "2026-06-01T10:00:00Z",
        detail: {
          timeToFirstPrProgressMs: 300,
          repoMetrics: [
            { durationMs: 400, queueWaitMs: 50 },
            { durationMs: 500, queueWaitMs: 75 },
          ],
        },
      },
      {
        action: "auto-refresh",
        ok: true,
        durationMs: 2000,
        triggeredAt: "2026-06-01T09:00:00Z",
        detail: {
          timeToFirstPrProgressMs: 500,
          repoMetrics: [{ durationMs: 700, queueWaitMs: 100 }],
        },
      },
      {
        action: "auto-refresh",
        ok: false,
        durationMs: 3000,
        triggeredAt: "2026-06-01T08:00:00Z",
        detail: {
          timeToFirstPrProgressMs: 900,
          repoMetrics: [{ durationMs: 1000, queueWaitMs: 120 }],
        },
      },
    ];

    const summary = buildAutoRefreshMetricsSummary({
      entries,
      limit: 5,
      includeFailures: false,
    });

    expect(summary.runCount).toBe(2);
    expect(summary.latestRunAt).toBe("2026-06-01T10:00:00Z");
    expect(summary.durationMs.avg).toBe(1500);
    expect(summary.timeToFirstPrProgressMs.avg).toBe(400);
    expect(summary.perRepoDurationMs.count).toBe(3);
    expect(summary.perRepoQueueWaitMs.count).toBe(3);
  });

  test("ignores non auto-refresh entries and enforces limit", () => {
    const summary = buildAutoRefreshMetricsSummary({
      entries: [
        { action: "manual-refresh", ok: true, durationMs: 100 },
        { action: "auto-refresh", ok: true, durationMs: 200 },
        { action: "auto-refresh", ok: true, durationMs: 400 },
      ],
      limit: 1,
      includeFailures: false,
    });

    expect(summary.runCount).toBe(1);
    expect(summary.durationMs.avg).toBe(200);
  });

  test("includes failed runs when includeFailures is true", () => {
    const summary = buildAutoRefreshMetricsSummary({
      entries: [
        { action: "auto-refresh", ok: false, durationMs: 2500, detail: {} },
      ],
      limit: 3,
      includeFailures: true,
    });

    expect(summary.runCount).toBe(1);
    expect(summary.durationMs.avg).toBe(2500);
  });

  test("returns empty metric blocks when no matching runs are selected", () => {
    const summary = buildAutoRefreshMetricsSummary({
      entries: [{ action: "manual-refresh", ok: true, durationMs: 111 }],
      limit: 3,
      includeFailures: false,
    });

    expect(summary.runCount).toBe(0);
    expect(summary.latestRunAt).toBeNull();
    expect(summary.durationMs).toEqual({
      count: 0,
      min: null,
      max: null,
      avg: null,
      p50: null,
      p95: null,
    });
  });
});

describe("report-auto-refresh-metrics CLI", () => {
  test("prints help text", () => {
    const logger = makeLogger();
    const exitCode = runAutoRefreshMetricsReport(["--help"], logger);

    expect(exitCode).toBe(0);
    expect(logger.lines.join("\n")).toContain("Usage: node src/dependencies/report-auto-refresh-metrics.js");
  });

  test("prints JSON summary", () => {
    const tempDir = makeTempDir();
    const actionLogFile = path.join(tempDir, "action-log.json");
    fs.writeFileSync(
      actionLogFile,
      JSON.stringify([
        {
          action: "auto-refresh",
          ok: true,
          durationMs: 1500,
          triggeredAt: "2026-06-01T11:00:00Z",
          detail: { timeToFirstPrProgressMs: 250, repoMetrics: [] },
        },
      ]),
      "utf8",
    );

    const logger = makeLogger();
    const exitCode = runAutoRefreshMetricsReport(
      ["--file", actionLogFile, "--json"],
      logger,
    );

    expect(exitCode).toBe(0);

    const report = JSON.parse(logger.lines.join("\n"));
    expect(report.runCount).toBe(1);
    expect(report.durationMs.avg).toBe(1500);
  });

  test("prints human-readable summary", () => {
    const tempDir = makeTempDir();
    const actionLogFile = path.join(tempDir, "action-log.json");
    fs.writeFileSync(
      actionLogFile,
      JSON.stringify([
        {
          action: "auto-refresh",
          ok: true,
          durationMs: 1000,
          triggeredAt: "2026-06-01T11:00:00Z",
          detail: {
            timeToFirstPrProgressMs: 100,
            repoMetrics: [{ durationMs: 200, queueWaitMs: 50 }],
          },
        },
      ]),
      "utf8",
    );

    const logger = makeLogger();
    const exitCode = runAutoRefreshMetricsReport(["--file", actionLogFile], logger);

    expect(exitCode).toBe(0);
    const output = logger.lines.join("\n");
    expect(output).toContain("Auto-refresh metrics summary");
    expect(output).toContain("Run duration");
    expect(output).toContain("Time to first PR progress");
    expect(output).toContain("Per-repo duration");
    expect(output).toContain("Per-repo queue wait");
  });

  test("renders minute values and empty placeholders in text mode", () => {
    const tempDir = makeTempDir();
    const actionLogFile = path.join(tempDir, "action-log.json");
    fs.writeFileSync(
      actionLogFile,
      JSON.stringify([
        {
          action: "auto-refresh",
          ok: true,
          durationMs: 120000,
          triggeredAt: null,
          detail: {
            timeToFirstPrProgressMs: null,
            repoMetrics: [{ durationMs: 61000, queueWaitMs: null }],
          },
        },
      ]),
      "utf8",
    );

    const logger = makeLogger();
    const exitCode = runAutoRefreshMetricsReport(["--file", actionLogFile], logger);

    expect(exitCode).toBe(0);
    const output = logger.lines.join("\n");
    expect(output).toContain("2.00m");
    expect(output).toContain("1.02m");
    expect(output).toContain("Latest run: -");
    expect(output).toContain("avg: 0.00s");
  });

  test("renders dash placeholders when no auto-refresh entries are present", () => {
    const tempDir = makeTempDir();
    const actionLogFile = path.join(tempDir, "action-log.json");
    fs.writeFileSync(
      actionLogFile,
      JSON.stringify([{ action: "manual-refresh", ok: true, durationMs: 321 }]),
      "utf8",
    );

    const logger = makeLogger();
    const exitCode = runAutoRefreshMetricsReport(["--file", actionLogFile], logger);

    expect(exitCode).toBe(0);
    const output = logger.lines.join("\n");
    expect(output).toContain("Runs analyzed: 0");
    expect(output).toContain("avg: 0.00s");
    expect(output).toContain("p95: 0.00s");
  });
});
