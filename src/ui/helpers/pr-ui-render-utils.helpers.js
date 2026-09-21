(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsUiRenderUtilsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
