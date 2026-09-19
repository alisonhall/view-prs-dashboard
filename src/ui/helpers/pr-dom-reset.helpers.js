(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDomResetHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDomResetHelpers = () => {
    /**
     * Clear all child nodes from an element using the safest available method.
     * Avoids memory leaks by properly removing children instead of innerHTML.
     * @param {HTMLElement} element - Element to clear
     */
    const clearElementContents = (element) => {
      if (!element) return;
      
      // Modern browsers: replaceChildren() is most efficient
      if (typeof element.replaceChildren === "function") {
        element.replaceChildren();
        return;
      }
      
      // Real DOM: Remove children one by one (better for GC than innerHTML)
      if (typeof element.removeChild === "function") {
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        return;
      }
      
      // Fallback for test mocks or non-DOM objects with children array
      if (Array.isArray(element.children)) {
        element.children.length = 0;
      }
      
      // Last resort (for test mocks)
      if (typeof element.innerHTML === "string") {
        element.innerHTML = "";
      }
    };

    return {
      clearElementContents,
    };
  };

  return {
    createPrDomResetHelpers,
  };
});
