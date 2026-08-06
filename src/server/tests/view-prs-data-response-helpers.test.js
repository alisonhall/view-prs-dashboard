const {
  createViewPrsDataResponseHelpers,
} = require("../helpers/view-prs-data-response-helpers");

describe("view-prs data response helpers", () => {
  test("given a backfill status error with a message, when building backfill failure payload, then the payload preserves the message and file references", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 12 }),
      getViewPrsSchedulerPublicState: () => ({ running: true }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    const payload = helpers.buildBackfillFailurePayload(new Error("timeout"));

    expect(payload).toEqual({
      ok: false,
      running: false,
      pid: null,
      logFile: "/tmp/backfill.log",
      pidFile: "/tmp/backfill.pid",
      summary: "timeout",
      output: "",
      error: "timeout",
    });
  });

  test("given a backfill status error without a message, when building backfill failure payload, then the default summary and error text are used", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 12 }),
      getViewPrsSchedulerPublicState: () => ({ running: true }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    const payload = helpers.buildBackfillFailurePayload({});

    expect(payload.summary).toBe("Backfill status failed");
    expect(payload.error).toBe("Backfill status failed");
  });

  test("given data and backfill state, when building the data payload, then metadata and scheduler state are included with a stable route contract", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 2, generatedAt: "2026-07-22T00:00:00.000Z" }),
      getViewPrsSchedulerPublicState: () => ({ running: false, intervalMs: 5000 }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    const payload = helpers.buildDataPayload({
      data: { byPrNumber: { "10": { number: "10" } }, lastRun: "now" },
      backfill: { ok: true, running: false },
    });

    expect(payload).toEqual({
      ok: true,
      byPrNumber: { "10": { number: "10" } },
      lastRun: "now",
      dataMeta: { rows: 2, generatedAt: "2026-07-22T00:00:00.000Z" },
      scheduler: { running: false, intervalMs: 5000 },
      backfill: { ok: true, running: false },
    });
  });

  test("given metadata, when building the data-meta payload, then supportsDataManifest and metadata are returned", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 5, generatedAt: "2026-07-22T00:00:00.000Z" }),
      getViewPrsSchedulerPublicState: () => ({ running: false }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    expect(helpers.buildDataMetaPayload()).toEqual({
      ok: true,
      supportsDataManifest: true,
      rows: 5,
      generatedAt: "2026-07-22T00:00:00.000Z",
    });
  });

  test("given a manifest object, when building the data-manifest payload, then manifest and metadata are included", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 3 }),
      getViewPrsSchedulerPublicState: () => ({ running: false }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    expect(
      helpers.buildDataManifestPayload({
        manifest: { keys: ["10", "20"] },
      }),
    ).toEqual({
      ok: true,
      manifest: { keys: ["10", "20"] },
      dataMeta: { rows: 3 },
    });
  });

  test("given scheduler state, when building the scheduler payload, then the route contract includes ok and scheduler fields", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 3 }),
      getViewPrsSchedulerPublicState: () => ({ running: true, intervalMs: 15000 }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    expect(helpers.buildSchedulerPayload()).toEqual({
      ok: true,
      scheduler: { running: true, intervalMs: 15000 },
    });
  });

  test("given delta payload and data, when building the data-delta response payload, then metadata scheduler and lastRun are included", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 7 }),
      getViewPrsSchedulerPublicState: () => ({ running: false, intervalMs: 30000 }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    expect(
      helpers.buildDataDeltaPayload({
        deltaPayload: {
          byPrNumber: { "123": { number: "123" } },
          missingPrNumbers: ["999"],
          requestedCount: 2,
        },
        data: { lastRun: "2026-07-22T12:00:00.000Z" },
      }),
    ).toEqual({
      ok: true,
      byPrNumber: { "123": { number: "123" } },
      missingPrNumbers: ["999"],
      requestedCount: 2,
      dataMeta: { rows: 7 },
      scheduler: { running: false, intervalMs: 30000 },
      lastRun: "2026-07-22T12:00:00.000Z",
    });
  });

  test("given data without lastRun, when building the data-delta response payload, then lastRun is null", () => {
    const helpers = createViewPrsDataResponseHelpers({
      getViewPrsDataMeta: () => ({ rows: 7 }),
      getViewPrsSchedulerPublicState: () => ({ running: false }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
    });

    expect(
      helpers.buildDataDeltaPayload({
        deltaPayload: {
          byPrNumber: {},
          missingPrNumbers: [],
          requestedCount: 0,
        },
        data: {},
      }),
    ).toEqual({
      ok: true,
      byPrNumber: {},
      missingPrNumbers: [],
      requestedCount: 0,
      dataMeta: { rows: 7 },
      scheduler: { running: false },
      lastRun: null,
    });
  });
});