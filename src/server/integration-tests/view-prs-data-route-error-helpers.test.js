const {
  createViewPrsDataRouteErrorHelpers,
  DATA_ROUTE_ERROR_MESSAGES,
} = require("../helpers/view-prs-data-route-error-helpers");

describe("view-prs data route error helpers", () => {
  test("given known route keys, when resolving error messages, then the configured fallback strings are returned", () => {
    const { getDataRouteErrorMessage } = createViewPrsDataRouteErrorHelpers();

    expect(getDataRouteErrorMessage("dataMeta")).toBe(DATA_ROUTE_ERROR_MESSAGES.dataMeta);
    expect(getDataRouteErrorMessage("dataManifest")).toBe(
      DATA_ROUTE_ERROR_MESSAGES.dataManifest,
    );
    expect(getDataRouteErrorMessage("dataDelta")).toBe(DATA_ROUTE_ERROR_MESSAGES.dataDelta);
    expect(getDataRouteErrorMessage("scheduler")).toBe(DATA_ROUTE_ERROR_MESSAGES.scheduler);
  });

  test("given an unknown key, when resolving an error message, then a safe internal-server fallback is returned", () => {
    const { getDataRouteErrorMessage } = createViewPrsDataRouteErrorHelpers();

    expect(getDataRouteErrorMessage("unknown")).toBe("Internal server error");
  });
});