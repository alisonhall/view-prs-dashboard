const {
  createViewPrsBackfillRouteHelpers,
} = require("../helpers/view-prs-backfill-route-helpers");

describe("view-prs backfill route helpers", () => {
  const createHelpers = () =>
    createViewPrsBackfillRouteHelpers({
      formatScriptFailureMessage: (failure, fallback) =>
        failure?.scriptMessage || fallback,
      parseBackfillCommandOutput: () => ({
        running: false,
        pid: "123",
        logFile: "/tmp/parsed.log",
        summary: "parsed summary",
        rawOutput: "raw output",
      }),
      viewPrsBackfillLogFile: "/tmp/backfill.log",
      viewPrsBackfillPidFile: "/tmp/backfill.pid",
      viewPrsBackfillManagerRelativePath: "run-prs/backfill.sh",
    });

  test("given an action-log read error, when building the failure result, then status and payload include entries fallback and message", () => {
    const helpers = createHelpers();

    expect(helpers.buildReadActionLogFailureResult(new Error("no file"))).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        error: "no file",
        entries: [],
      },
    });
  });

  test("given action-log entries, when building success result, then status is 200 with ok envelope and entries payload", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildReadActionLogSuccessResult([
        { action: "get/backfill", ok: true },
      ]),
    ).toEqual({
      responseStatusCode: 200,
      responsePayload: {
        ok: true,
        entries: [{ action: "get/backfill", ok: true }],
      },
    });
  });

  test("given a backfill log read error, when building the failure result, then status and payload summary mirror the error and include log file", () => {
    const helpers = createHelpers();

    expect(helpers.buildReadBackfillLogFailureResult(new Error("read failed"))).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        logFile: "/tmp/backfill.log",
        error: "read failed",
        summary: "read failed",
        tail: "",
      },
    });
  });

  test("given a backfill log read result, when building success result, then status is 200 and payload is passed through", () => {
    const helpers = createHelpers();
    const payload = {
      ok: true,
      logFile: "/tmp/backfill.log",
      summary: "tail loaded",
      tail: "line-1\nline-2",
    };

    expect(helpers.buildReadBackfillLogSuccessResult(payload)).toEqual({
      responseStatusCode: 200,
      responsePayload: payload,
    });
  });

  test("given a backfill status failure, when building failure result, then action-log entry and response payload are produced", () => {
    const helpers = createHelpers();

    const result = helpers.buildBackfillStatusFailureResult({
      error: new Error("status failed"),
      timingContext: {
        triggeredAt: "2026-07-22T00:00:00.000Z",
        startedAtMs: Date.now() - 5,
      },
    });

    expect(result.actionLogEntry.action).toBe("get/backfill");
    expect(result.actionLogEntry.ok).toBe(false);
    expect(result.actionLogEntry.error).toBe("status failed");
    expect(result.responsePayload).toEqual({
      ok: false,
      error: "status failed",
    });
    expect(result.responseStatusCode).toBe(500);
  });

  test("given a backfill status payload, when building success result, then action-log detail and status code are derived from payload ok", () => {
    const helpers = createHelpers();

    const result = helpers.buildBackfillStatusSuccessResult({
      backfill: {
        ok: false,
        running: true,
        pid: "456",
      },
      timingContext: {
        triggeredAt: "2026-07-22T00:00:00.000Z",
        startedAtMs: Date.now() - 5,
      },
    });

    expect(result.actionLogEntry).toMatchObject({
      action: "get/backfill",
      ok: false,
      detail: {
        running: true,
        pid: "456",
      },
    });
    expect(result.responseStatusCode).toBe(500);
    expect(result.responsePayload).toEqual({
      ok: false,
      running: true,
      pid: "456",
    });
  });

  test("given a backfill action failure, when building failure result, then parsed output and fallback command fields are included", () => {
    const helpers = createHelpers();

    const result = helpers.buildBackfillActionFailureResult({
      failure: {
        scriptMessage: "action failed",
      },
      action: "start",
      timingContext: {
        triggeredAt: "2026-07-22T00:00:00.000Z",
        startedAtMs: Date.now() - 5,
      },
    });

    expect(result.actionLogEntry).toMatchObject({
      action: "post/backfill/:action",
      ok: false,
      error: "action failed",
      detail: { action: "start" },
    });
    expect(result.responsePayload).toEqual({
      ok: false,
      command: "bash run-prs/backfill.sh start",
      running: false,
      pid: "123",
      logFile: "/tmp/parsed.log",
      pidFile: "/tmp/backfill.pid",
      summary: "parsed summary",
      output: "raw output",
      error: "action failed",
    });
    expect(result.responseStatusCode).toBe(500);
  });

  test("given a backfill action success payload, when building success result, then action-log detail and response payload are returned", () => {
    const helpers = createHelpers();

    const result = helpers.buildBackfillActionSuccessResult({
      result: {
        ok: true,
        running: false,
        pid: "999",
      },
      action: "stop",
      timingContext: {
        triggeredAt: "2026-07-22T00:00:00.000Z",
        startedAtMs: Date.now() - 5,
      },
    });

    expect(result.actionLogEntry).toMatchObject({
      action: "post/backfill/:action",
      ok: true,
      detail: {
        action: "stop",
        running: false,
        pid: "999",
      },
    });
    expect(result.responsePayload).toEqual({
      ok: true,
      running: false,
      pid: "999",
    });
    expect(result.responseStatusCode).toBe(200);
  });

  test("given mixed-case and padded backfill action text, when normalizing the action, then lowercased trimmed action is returned", () => {
    const helpers = createHelpers();

    expect(helpers.normalizeBackfillAction("  StArT  ")).toBe("start");
  });

  test("given an unsupported normalized backfill action, when validating and building invalid result, then helper marks action unsupported and returns route contract status and payload", () => {
    const helpers = createHelpers();

    const action = helpers.normalizeBackfillAction("restart");

    expect(helpers.isSupportedBackfillAction(action)).toBe(false);
    expect(helpers.buildInvalidBackfillActionResult(action)).toEqual({
      responseStatusCode: 400,
      responsePayload: {
        ok: false,
        error: "Invalid backfill action: restart",
      },
    });
  });
});