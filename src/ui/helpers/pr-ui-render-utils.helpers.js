// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsUiRenderUtilsHelpers fallback.
export const { createPrUiRenderUtilsHelpers } = (() => {
  const createPrUiRenderUtilsHelpers = () => {
    const parseMarkerState = (titleDisplay = "", marker = "CHK") => {
      const match = String(titleDisplay || "").match(
        new RegExp(`\\[${marker}:([^\\]]+)\\]`),
      );
      return match && match[1] ? String(match[1]).trim().toUpperCase() : "-";
    };

    const safeJsonStringify = (value) => {
      try {
        return JSON.stringify(value, null, 2);
      } catch (_error) {
        return String(value);
      }
    };

    return {
      parseMarkerState,
      safeJsonStringify,
    };
  };

  return {
    createPrUiRenderUtilsHelpers,
  };
})();
