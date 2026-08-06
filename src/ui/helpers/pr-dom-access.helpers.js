(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDomAccessHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDomAccessHelpers = ({ documentRef } = {}) => {
    const getDocument = () =>
      documentRef || (typeof document !== "undefined" && document ? document : null);

    const getOptionalElementById = (id) => {
      const doc = getDocument();
      if (!doc || typeof doc.getElementById !== "function") {
        return null;
      }
      try {
        return doc.getElementById(id);
      } catch (_error) {
        return null;
      }
    };

    const readElementAttribute = (element, name) => {
      if (!element || !name) return "";
      if (typeof element.getAttribute === "function") {
        return String(element.getAttribute(name) || "");
      }
      if (element.attributes && typeof element.attributes === "object") {
        return String(element.attributes[name] || "");
      }
      return "";
    };

    return {
      getOptionalElementById,
      readElementAttribute,
    };
  };

  return {
    createPrDomAccessHelpers,
  };
});
