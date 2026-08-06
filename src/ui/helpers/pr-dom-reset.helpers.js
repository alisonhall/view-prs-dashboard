(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDomResetHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDomResetHelpers = () => {
    const clearElementContents = (element) => {
      if (!element) return;
      if (typeof element.replaceChildren === "function") {
        element.replaceChildren();
      } else if (Array.isArray(element.children)) {
        element.children.length = 0;
      }
      element.innerHTML = "";
    };

    return {
      clearElementContents,
    };
  };

  return {
    createPrDomResetHelpers,
  };
});
