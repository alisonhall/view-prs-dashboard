const { createPrBackfillActionHelpers } = require("../helpers/pr-backfill-actions.helpers.js");

const createDeps = (overrides = {}) => {
  const setSupportsBackfillLogPolling = jest.fn();
  const setBackfillLogMessage = jest.fn();
  const updateBackfillStatusFromPayload = jest.fn();
  const beginFinish = jest.fn();

  return {
    fetch: jest.fn(),
    postJson: jest.fn(),
    beginRequestActivity: jest.fn(() => beginFinish),
    setStatusMessage: jest.fn(),
    setOutputMessage: jest.fn(),
    setButtonDisabled: jest.fn(),
    notifyFailureSnackbar: jest.fn(),
    formatCommandOutput: jest.fn((value) => `formatted:${value?.summary || value?.error || ""}`),
    stripAnsi: jest.fn((value) => String(value || "")),
    updateBackfillStatusFromPayload,
    setBackfillLogMessage,
    autoScrollBackfillLogToBottom: jest.fn(),
    formatBackfillLogMessage: jest.fn(({ summary = "", tail = "" }) => `${summary}|${tail}`),
    getSupportsBackfillLogPolling: jest.fn(() => true),
    setSupportsBackfillLogPolling,
    getIsBackfillRunning: jest.fn(() => false),
    setIsBackfillActionPending: jest.fn(),
    backfillLogTailLines: 25,
    _finishSpy: beginFinish,
    ...overrides,
  };
};

describe("pr backfill action helpers", () => {
  test("loadBackfillLogTail short-circuits when polling support is disabled", async () => {
    const deps = createDeps({
      getSupportsBackfillLogPolling: jest.fn(() => false),
    });
    const helpers = createPrBackfillActionHelpers(deps);

    await expect(helpers.loadBackfillLogTail()).resolves.toEqual({
      ok: false,
      summary: "Backfill log endpoint is unavailable",
      tail: "",
    });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  test("loadBackfillLogTail handles endpoint 404 by disabling support", async () => {
    const deps = createDeps({
      fetch: jest.fn(async () => ({ status: 404 })),
    });
    const helpers = createPrBackfillActionHelpers(deps);

    const result = await helpers.loadBackfillLogTail();
    expect(result.ok).toBe(false);
    expect(deps.setSupportsBackfillLogPolling).toHaveBeenCalledWith(false);
    expect(deps.setBackfillLogMessage).toHaveBeenCalledWith(
      expect.stringContaining("endpoint is unavailable (404)"),
    );
  });

  test("loadBackfillLogTail renders returned tail on success", async () => {
    const deps = createDeps({
      fetch: jest.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ ok: true, summary: "ok", tail: "line" }),
      })),
    });
    const helpers = createPrBackfillActionHelpers(deps);

    await expect(helpers.loadBackfillLogTail()).resolves.toMatchObject({
      ok: true,
      summary: "ok",
    });
    expect(deps.formatBackfillLogMessage).toHaveBeenCalledWith({
      summary: "ok",
      tail: "line",
    });
    expect(deps.autoScrollBackfillLogToBottom).toHaveBeenCalled();
  });

  test("loadBackfillStatus updates payload and optionally loads log", async () => {
    const deps = createDeps({
      fetch: jest
        .fn()
        .mockImplementationOnce(async () => ({
          ok: true,
          json: async () => ({ ok: true, running: true }),
        }))
        .mockImplementationOnce(async () => ({
          status: 200,
          ok: true,
          json: async () => ({ ok: true, summary: "tail", tail: "abc" }),
        })),
    });
    const helpers = createPrBackfillActionHelpers(deps);

    const result = await helpers.loadBackfillStatus({ announce: true, includeLog: true });
    expect(result.ok).toBe(true);
    expect(deps.updateBackfillStatusFromPayload).toHaveBeenCalledWith(
      { ok: true, running: true },
      { announce: true },
    );
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  test("handleBackfillAction surfaces failed command responses", async () => {
    const deps = createDeps({
      postJson: jest.fn(async () => ({
        response: { ok: false },
        result: { ok: false, error: "cannot start" },
      })),
      fetch: jest.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, running: false }),
      })),
    });

    const helpers = createPrBackfillActionHelpers(deps);
    await helpers.handleBackfillAction("start");

    expect(deps.setStatusMessage).toHaveBeenCalledWith("Failed to start backfill");
    expect(deps.notifyFailureSnackbar).toHaveBeenCalledWith(
      "Starting backfill failed",
      { ok: false, error: "cannot start" },
      "Failed to start backfill",
    );
    expect(deps.setIsBackfillActionPending).toHaveBeenNthCalledWith(1, true);
    expect(deps.setIsBackfillActionPending).toHaveBeenLastCalledWith(false);
    expect(deps._finishSpy).toHaveBeenCalled();
  });

  test("handleBackfillAction success sets output and requests status refresh", async () => {
    const deps = createDeps({
      postJson: jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, summary: "started", output: "ok output" },
      })),
      fetch: jest.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, running: false }),
      })),
    });

    const helpers = createPrBackfillActionHelpers(deps);
    await helpers.handleBackfillAction("start");

    expect(deps.setStatusMessage).toHaveBeenCalledWith("started");
    expect(deps.setOutputMessage).toHaveBeenCalledWith("formatted:started");
    expect(deps.updateBackfillStatusFromPayload).toHaveBeenCalledWith({
      ok: true,
      summary: "started",
      output: "ok output",
    });
    expect(deps.fetch).toHaveBeenCalledWith("/view-prs/backfill");
  });

  // Regression coverage for a real gap found during a Phase 7 sweep (see
  // REACT_MIGRATION_PLAN.md): only the "postJson resolves" success/failure
  // shapes had coverage - the thrown-error catch branch, the finally
  // block's own inner try/catch, and the "stop" action's branching were
  // all untested.
  test("handleBackfillAction surfaces a thrown error (postJson rejects), not just a resolved failure shape", async () => {
    const deps = createDeps({
      postJson: jest.fn(async () => {
        throw new Error("network down");
      }),
      fetch: jest.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, running: false }),
      })),
    });

    const helpers = createPrBackfillActionHelpers(deps);
    await helpers.handleBackfillAction("start");

    expect(deps.setStatusMessage).toHaveBeenCalledWith("Failed to start backfill");
    expect(deps.setOutputMessage).toHaveBeenCalledWith("Error: network down");
    expect(deps.notifyFailureSnackbar).toHaveBeenCalledWith(
      "Starting backfill failed",
      expect.any(Error),
      "Failed to start backfill",
    );
    expect(deps.setIsBackfillActionPending).toHaveBeenLastCalledWith(false);
    expect(deps._finishSpy).toHaveBeenCalled();
  });

  test("handleBackfillAction re-enables all 4 buttons when the finally block's own status refresh also throws", async () => {
    const deps = createDeps({
      postJson: jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, summary: "started" },
      })),
      // loadBackfillStatus's own fetch (both the try block's post-start
      // refresh and the finally block's refresh) rejects every time.
      fetch: jest.fn(async () => {
        throw new Error("status fetch failed");
      }),
    });

    const helpers = createPrBackfillActionHelpers(deps);
    await expect(helpers.handleBackfillAction("start")).resolves.toBeUndefined();

    expect(deps.setButtonDisabled).toHaveBeenCalledWith("backfill-start-btn", false);
    expect(deps.setButtonDisabled).toHaveBeenCalledWith("backfill-stop-btn", false);
    expect(deps.setButtonDisabled).toHaveBeenCalledWith("backfill-refresh-btn", false);
    expect(deps.setButtonDisabled).toHaveBeenCalledWith("backfill-log-refresh-btn", false);
    expect(deps._finishSpy).toHaveBeenCalled();
  });

  test("handleBackfillAction only refreshes status once (from finally) for the stop action, not twice", async () => {
    const deps = createDeps({
      postJson: jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, summary: "stopped" },
      })),
      fetch: jest.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, running: false }),
      })),
    });

    const helpers = createPrBackfillActionHelpers(deps);
    await helpers.handleBackfillAction("stop");

    // The try block only calls loadBackfillStatus for "start" - "stop"
    // only gets the finally block's own unconditional refresh.
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.setStatusMessage).toHaveBeenCalledWith("stopped");
  });
});
