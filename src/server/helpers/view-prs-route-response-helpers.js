const createViewPrsRouteResponseHelpers = () => {
  const runSafely = ({ run, onError }) => {
    try {
      return run();
    } catch (error) {
      return onError(error);
    }
  };

  const runSafelyAsync = async ({ run, onError }) => {
    try {
      return await run();
    } catch (error) {
      return onError(error);
    }
  };

  const sendSuccessPayload = ({ res, payload }) => res.status(200).json(payload);

  const sendRouteResult = ({ res, result }) =>
    res.status(result.responseStatusCode).json(result.responsePayload);

  const sendErrorStatus = ({ res, statusCode, error }) =>
    res.status(statusCode).json({
      ok: false,
      error,
    });

  const sendOk = ({ res, payload = {} }) => res.status(200).json({ ok: true, ...payload });

  const sendEntries = ({ res, entries }) =>
    sendOk({
      res,
      payload: {
        entries,
        count: Object.keys(entries).length,
      },
    });

  const sendInternalError = ({ res, error, fallbackMessage }) =>
    res.status(500).json({
      ok: false,
      error: error?.message || fallbackMessage || "Internal server error",
    });

  return {
    runSafely,
    runSafelyAsync,
    sendSuccessPayload,
    sendRouteResult,
    sendErrorStatus,
    sendOk,
    sendEntries,
    sendInternalError,
  };
};

module.exports = {
  createViewPrsRouteResponseHelpers,
};