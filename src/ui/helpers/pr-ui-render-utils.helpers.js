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

    const setClassToken = (element, token, enabled) => {
      if (!element) return;
      const tokens = String(element.className || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const hasToken = tokens.includes(token);
      if (enabled && !hasToken) {
        tokens.push(token);
      }
      if (!enabled && hasToken) {
        element.className = tokens.filter((value) => value !== token).join(" ");
        return;
      }
      if (enabled) {
        element.className = tokens.join(" ");
      }
    };

    return {
      parseMarkerState,
      safeJsonStringify,
      setClassToken,
    };
  };

  return {
    createPrUiRenderUtilsHelpers,
  };
});
