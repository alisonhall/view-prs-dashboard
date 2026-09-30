// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsDomAccessHelpers fallback.
export const { createPrDomAccessHelpers } = (() => {
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
})();
