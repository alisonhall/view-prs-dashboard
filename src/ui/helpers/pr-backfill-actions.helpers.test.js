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
});
