const DATA_ROUTE_ERROR_MESSAGES = {
  dataMeta: "Failed to fetch metadata",
  dataManifest: "Failed to fetch data manifest",
  dataDelta: "Failed to fetch data delta",
  scheduler: "Failed to fetch scheduler status",
};

const createViewPrsDataRouteErrorHelpers = () => {
  const getDataRouteErrorMessage = (key) =>
    DATA_ROUTE_ERROR_MESSAGES[key] || "Internal server error";

  return {
    getDataRouteErrorMessage,
  };
};

module.exports = {
  createViewPrsDataRouteErrorHelpers,
  DATA_ROUTE_ERROR_MESSAGES,
};