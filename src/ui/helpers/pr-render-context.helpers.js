(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderContextHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderContextHelpers = ({
    getElementById,
    captureInsightsViewState,
    capturePrSectionOpenState,
  } = {}) => {
    const getElementByIdSafe =
      typeof getElementById === "function" ? getElementById : () => null;
    const captureInsightsViewStateSafe =
      typeof captureInsightsViewState === "function"
        ? captureInsightsViewState
        : () => ({ expanded: new Set(), innerOpen: new Map() });
    const capturePrSectionOpenStateSafe =
      typeof capturePrSectionOpenState === "function"
        ? capturePrSectionOpenState
        : () => new Map();

    const captureRenderContext = (payload) => {
      const sectionsHost = getElementByIdSafe("pr-sections");
      const insightsViewState = captureInsightsViewStateSafe(sectionsHost);
      const prSectionOpenState = capturePrSectionOpenStateSafe(sectionsHost);
      const meta = getElementByIdSafe("data-meta");
      const scopeSelect = getElementByIdSafe("scope-mode");
      const byPrNumber = payload?.byPrNumber || {};
      const allEntries = Object.values(byPrNumber);
      const lastRun = payload?.lastRun || null;

      return {
        sectionsHost,
        insightsViewState,
        prSectionOpenState,
        meta,
        scopeSelect,
        byPrNumber,
        allEntries,
        lastRun,
      };
    };

    return {
      captureRenderContext,
    };
  };

  return {
    createPrRenderContextHelpers,
  };
});
