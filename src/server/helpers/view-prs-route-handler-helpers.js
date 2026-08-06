const createViewPrsRouteHandlerHelpers = ({
  runSafely,
  runSafelyAsync,
  sendInternalError,
}) => {
  const createSyncHandler = ({ handler, fallbackMessage, onError }) =>
    (req, res) =>
      runSafely({
        run: () => handler(req, res),
        onError: (error) => {
          if (typeof onError === "function") {
            return onError({ error, req, res });
          }
          return sendInternalError({
            res,
            error,
            fallbackMessage,
          });
        },
      });

  const createAsyncHandler = ({ handler, fallbackMessage, onError }) =>
    (req, res) =>
      runSafelyAsync({
        run: () => handler(req, res),
        onError: (error) => {
          if (typeof onError === "function") {
            return onError({ error, req, res });
          }
          return sendInternalError({
            res,
            error,
            fallbackMessage,
          });
        },
      });

  return {
    createSyncHandler,
    createAsyncHandler,
  };
};

module.exports = {
  createViewPrsRouteHandlerHelpers,
};