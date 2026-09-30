// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderContextHelpers fallback.
export const { createPrRenderContextHelpers } = (() => {
  const createPrRenderContextHelpers = ({
    getElementById,
    capturePrSectionOpenState,
  } = {}) => {
    const getElementByIdSafe =
      typeof getElementById === "function" ? getElementById : () => null;
    const capturePrSectionOpenStateSafe =
      typeof capturePrSectionOpenState === "function"
        ? capturePrSectionOpenState
        : () => new Map();

    const captureRenderContext = (payload) => {
      const sectionsHost = getElementByIdSafe("pr-sections");
      const prSectionOpenState = capturePrSectionOpenStateSafe(sectionsHost);
      const meta = getElementByIdSafe("data-meta");
      const scopeSelect = getElementByIdSafe("scope-mode");
      const byPrNumber = payload?.byPrNumber || {};
      const allEntries = Object.values(byPrNumber);
      const lastRun = payload?.lastRun || null;

      return {
        sectionsHost,
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
})();
