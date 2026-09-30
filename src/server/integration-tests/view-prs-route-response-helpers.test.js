const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");

const createResponseDouble = () => {
  const res = {
    statusCode: null,
    payload: null,
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.payload = payload;
    return res;
  });
  return res;
};

describe("view-prs route response helpers", () => {
  test("given a successful callback, when running safely, then the callback result is returned without calling onError", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const onError = jest.fn();

    const result = helpers.runSafely({
      run: () => "ok",
      onError,
    });

    expect(result).toBe("ok");
    expect(onError).not.toHaveBeenCalled();
  });

  test("given a throwing callback, when running safely, then onError is called with the thrown error and its return value is returned", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const onError = jest.fn(() => "handled");

    const result = helpers.runSafely({
      run: () => {
        throw new Error("boom");
      },
      onError,
    });

    expect(result).toBe("handled");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("boom");
  });

  test("given an async callback that resolves, when running safely async, then the resolved result is returned without calling onError", async () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const onError = jest.fn();

    const result = await helpers.runSafelyAsync({
      run: async () => "ok-async",
      onError,
    });

    expect(result).toBe("ok-async");
    expect(onError).not.toHaveBeenCalled();
  });

  test("given an async callback that rejects, when running safely async, then onError is called with the rejection error and its return value is returned", async () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const onError = jest.fn(() => "handled-async");

    const result = await helpers.runSafelyAsync({
      run: async () => {
        throw new Error("boom-async");
      },
      onError,
    });

    expect(result).toBe("handled-async");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("boom-async");
  });

  test("given a payload that already defines its contract, when sending a success payload, then status 200 returns that payload unchanged", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();
    const payload = { ok: true, rows: 3, scheduler: { running: false } };

    helpers.sendSuccessPayload({ res, payload });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test("given a route result contract, when sending a route result, then status and payload are forwarded unchanged", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();
    const result = {
      responseStatusCode: 409,
      responsePayload: {
        ok: false,
        error: "Auto run already in progress",
      },
    };

    helpers.sendRouteResult({ res, result });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Auto run already in progress",
    });
  });

  test("given an explicit status and error message, when sending error status, then ok false payload is returned with that status", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();

    helpers.sendErrorStatus({
      res,
      statusCode: 404,
      error: "Comment not found",
    });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Comment not found",
    });
  });

  test("given a payload, when sending an ok response, then status 200 and merged ok payload are returned", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();

    helpers.sendOk({ res, payload: { overrides: { onlyMine: true } } });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      overrides: { onlyMine: true },
    });
  });

  test("given entries, when sending entries response, then status 200 includes entries and count", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();

    helpers.sendEntries({
      res,
      entries: {
        alice: "Alice",
        bob: "Bob",
      },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      entries: {
        alice: "Alice",
        bob: "Bob",
      },
      count: 2,
    });
  });

  test("given an error message, when sending an internal error response, then status 500 includes that error message", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();

    helpers.sendInternalError({
      res,
      error: new Error("boom"),
      fallbackMessage: "failed",
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "boom",
    });
  });

  test("given an error without message, when sending an internal error response, then fallback text is used", () => {
    const helpers = createViewPrsRouteResponseHelpers();
    const res = createResponseDouble();

    helpers.sendInternalError({
      res,
      error: {},
      fallbackMessage: "failed",
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "failed",
    });
  });
});