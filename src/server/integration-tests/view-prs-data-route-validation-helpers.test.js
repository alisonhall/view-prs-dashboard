const {
  createViewPrsDataRouteValidationHelpers,
} = require("../helpers/view-prs-data-route-validation-helpers");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

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

describe("view-prs data route validation helpers", () => {
  test("given a non-object body, when validating JSON object body, then 400 is written and null is returned", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();

    const body = helpers.validateJsonObjectBody({ body: null, res });

    expect(body).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Request body must be a JSON object",
    });
  });

  test("given an object body, when validating JSON object body, then the original body is returned without writing an error", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();
    const input = { enabled: true };

    const body = helpers.validateJsonObjectBody({ body: input, res });

    expect(body).toBe(input);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test("given an empty mapping, when validating non-empty mappings, then 400 is written and false is returned", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();

    const ok = helpers.validateNonEmptyMappings({
      entries: {},
      res,
      errorMessage: "At least one mapping is required",
    });

    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "At least one mapping is required",
    });
  });

  test("given a non-empty mapping, when validating non-empty mappings, then true is returned without writing an error", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();

    const ok = helpers.validateNonEmptyMappings({
      entries: { alice: "Alice" },
      res,
      errorMessage: "At least one mapping is required",
    });

    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test("given a body without prNumbers array, when validating data-delta request, then 400 is written and false is returned", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();

    const ok = helpers.validateDataDeltaRequest({
      body: { prNumbers: null },
      res,
    });

    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Request body must include prNumbers array",
    });
  });

  test("given a body with prNumbers array, when validating data-delta request, then true is returned without writing an error", () => {
    const helpers = createViewPrsDataRouteValidationHelpers({ isObject });
    const res = createResponseDouble();

    const ok = helpers.validateDataDeltaRequest({
      body: { prNumbers: ["1", "2"] },
      res,
    });

    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test("given shared error sender, when validation fails, then sendErrorStatus is used with 400 and the expected message", () => {
    const sendErrorStatus = jest.fn();
    const helpers = createViewPrsDataRouteValidationHelpers({
      isObject,
      sendErrorStatus,
    });
    const res = createResponseDouble();

    const body = helpers.validateJsonObjectBody({ body: null, res });

    expect(body).toBeNull();
    expect(sendErrorStatus).toHaveBeenCalledWith({
      res,
      statusCode: 400,
      error: "Request body must be a JSON object",
    });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});