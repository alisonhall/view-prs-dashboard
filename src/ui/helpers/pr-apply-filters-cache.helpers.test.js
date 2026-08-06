/** @jest-environment jsdom */

const {
  createPrApplyFiltersCacheHelpers,
} = require("./pr-apply-filters-cache.helpers.js");

describe("pr apply filters cache helpers", () => {
  test("given cached payload is present, when applying filters from cache, then render and status update are triggered", () => {
    const renderPrData = jest.fn();
    const setStatusMessage = jest.fn();

    const { applyFiltersFromCache } = createPrApplyFiltersCacheHelpers({
      getLatestStoredPayload: () => ({ byPrNumber: { 1: {} } }),
      getLatestSelectedRepo: () => "org/repo",
      renderPrData,
      setStatusMessage,
      logError: jest.fn(),
    });

    applyFiltersFromCache();

    expect(renderPrData).toHaveBeenCalledWith(
      { byPrNumber: { 1: {} } },
      "org/repo",
    );
    expect(setStatusMessage).toHaveBeenCalledWith(
      "Applied local filters from stored JSON",
    );
  });

  test("given cached payload is missing, when applying filters from cache, then no render occurs", () => {
    const renderPrData = jest.fn();

    const { applyFiltersFromCache } = createPrApplyFiltersCacheHelpers({
      getLatestStoredPayload: () => null,
      getLatestSelectedRepo: () => "org/repo",
      renderPrData,
      setStatusMessage: jest.fn(),
      logError: jest.fn(),
    });

    applyFiltersFromCache();

    expect(renderPrData).not.toHaveBeenCalled();
  });

  test("given render throws, when applying filters from cache, then error is logged and failure status is set", () => {
    const error = new Error("render failed");
    const setStatusMessage = jest.fn();
    const logError = jest.fn();

    const { applyFiltersFromCache } = createPrApplyFiltersCacheHelpers({
      getLatestStoredPayload: () => ({ byPrNumber: { 1: {} } }),
      getLatestSelectedRepo: () => "org/repo",
      renderPrData: () => {
        throw error;
      },
      setStatusMessage,
      logError,
    });

    applyFiltersFromCache();

    expect(logError).toHaveBeenCalledWith(
      "Error applying filters from cache:",
      error,
    );
    expect(setStatusMessage).toHaveBeenCalledWith("Error applying filters");
  });
});
