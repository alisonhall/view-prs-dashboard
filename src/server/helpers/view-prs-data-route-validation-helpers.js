const createViewPrsDataRouteValidationHelpers = ({ isObject, sendErrorStatus }) => {
  const writeBadRequest = ({ res, error }) => {
    if (typeof sendErrorStatus === "function") {
      sendErrorStatus({ res, statusCode: 400, error });
      return;
    }

    res.status(400).json({
      ok: false,
      error,
    });
  };

  const validateJsonObjectBody = ({ body, res }) => {
    if (!isObject(body)) {
      writeBadRequest({
        res,
        error: "Request body must be a JSON object",
      });
      return null;
    }
    return body;
  };

  const validateNonEmptyMappings = ({ entries, res, errorMessage }) => {
    if (Object.keys(entries).length === 0) {
      writeBadRequest({ res, error: errorMessage });
      return false;
    }
    return true;
  };

  const validateDataDeltaRequest = ({ body, res }) => {
    if (!isObject(body) || !Array.isArray(body.prNumbers)) {
      writeBadRequest({
        res,
        error: "Request body must include prNumbers array",
      });
      return false;
    }
    return true;
  };

  return {
    validateJsonObjectBody,
    validateNonEmptyMappings,
    validateDataDeltaRequest,
  };
};

module.exports = {
  createViewPrsDataRouteValidationHelpers,
};