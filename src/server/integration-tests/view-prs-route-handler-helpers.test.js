const {
  createViewPrsRouteHandlerHelpers,
} = require("../helpers/view-prs-route-handler-helpers");

describe("view-prs route handler helpers", () => {
  test("given a sync handler, when creating and invoking the guarded handler, then runSafely receives a run callback and errors are forwarded with fallback message", () => {
    const runSafely = jest.fn(({ run, onError }) => {
      run();
      onError(new Error("boom-sync"));
      return "sync-result";
    });
    const runSafelyAsync = jest.fn();
    const sendInternalError = jest.fn();

    const { createSyncHandler } = createViewPrsRouteHandlerHelpers({
      runSafely,
      runSafelyAsync,
      sendInternalError,
    });

    const req = { body: {} };
    const res = { status: jest.fn(), json: jest.fn() };
    const handler = jest.fn();
    const guarded = createSyncHandler({
      handler,
      fallbackMessage: "sync fallback",
    });

    const result = guarded(req, res);

    expect(result).toBe("sync-result");
    expect(handler).toHaveBeenCalledWith(req, res);
    expect(runSafely).toHaveBeenCalledTimes(1);
    expect(sendInternalError).toHaveBeenCalledWith({
      res,
      error: expect.any(Error),
      fallbackMessage: "sync fallback",
    });
  });

  test("given an async handler, when creating and invoking the guarded handler, then runSafelyAsync receives a run callback and errors are forwarded with fallback message", async () => {
    const runSafely = jest.fn();
    const runSafelyAsync = jest.fn(async ({ run, onError }) => {
      await run();
      onError(new Error("boom-async"));
      return "async-result";
    });
    const sendInternalError = jest.fn();

    const { createAsyncHandler } = createViewPrsRouteHandlerHelpers({
      runSafely,
      runSafelyAsync,
      sendInternalError,
    });

    const req = { body: {} };
    const res = { status: jest.fn(), json: jest.fn() };
    const handler = jest.fn(async () => {});
    const guarded = createAsyncHandler({
      handler,
      fallbackMessage: "async fallback",
    });

    const result = await guarded(req, res);

    expect(result).toBe("async-result");
    expect(handler).toHaveBeenCalledWith(req, res);
    expect(runSafelyAsync).toHaveBeenCalledTimes(1);
    expect(sendInternalError).toHaveBeenCalledWith({
      res,
      error: expect.any(Error),
      fallbackMessage: "async fallback",
    });
  });

  test("given a custom onError callback, when a guarded handler catches an error, then the custom onError is used instead of default sendInternalError", () => {
    const runSafely = jest.fn(({ onError }) => onError(new Error("boom-custom")));
    const runSafelyAsync = jest.fn();
    const sendInternalError = jest.fn();
    const customOnError = jest.fn(() => "custom-handled");

    const { createSyncHandler } = createViewPrsRouteHandlerHelpers({
      runSafely,
      runSafelyAsync,
      sendInternalError,
    });

    const req = {};
    const res = { status: jest.fn(), json: jest.fn() };
    const guarded = createSyncHandler({
      handler: jest.fn(),
      onError: customOnError,
    });

    const result = guarded(req, res);

    expect(result).toBe("custom-handled");
    expect(customOnError).toHaveBeenCalledTimes(1);
    expect(sendInternalError).not.toHaveBeenCalled();
  });
});