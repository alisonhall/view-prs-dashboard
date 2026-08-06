(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDomVisibilityHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDomVisibilityHelpers = ({ readElementAttribute } = {}) => {
    const readElementAttributeSafe =
      typeof readElementAttribute === "function"
        ? readElementAttribute
        : (element, attribute) =>
            element && typeof element.getAttribute === "function"
              ? element.getAttribute(attribute)
              : null;

    const expandAncestorDetailsElements = (element) => {
      let current = element?.parentElement || null;
      while (current) {
        if (String(current?.tagName || "").toLowerCase() === "details") {
          current.open = true;
          if (typeof current.setAttribute === "function") {
            current.setAttribute("open", "");
          }
        }
        current = current.parentElement;
      }
    };

    const ensureInsightsRowVisibleForElement = (element) => {
      const row = element?.closest ? element.closest("tr") : null;
      if (!row || row.hidden !== true) {
        return;
      }
      const prRow = row.previousElementSibling;
      const toggleButton =
        prRow && typeof prRow.querySelector === "function"
          ? prRow.querySelector(".row-insights-toggle")
          : null;
      if (!toggleButton) {
        return;
      }
      const isExpanded =
        readElementAttributeSafe(toggleButton, "aria-expanded") === "true";
      if (!isExpanded && typeof toggleButton.onclick === "function") {
        toggleButton.onclick();
      }
    };

    return {
      expandAncestorDetailsElements,
      ensureInsightsRowVisibleForElement,
    };
  };

  return {
    createPrDomVisibilityHelpers,
  };
});
