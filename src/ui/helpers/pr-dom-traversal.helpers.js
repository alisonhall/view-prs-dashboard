// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsDomTraversalHelpers fallback.
export const { createPrDomTraversalHelpers } = (() => {
  const createPrDomTraversalHelpers = () => {
    const collectNodesByClass = (root, className) => {
      const results = [];
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (
          String(node.className || "")
            .split(/\s+/)
            .includes(className)
        ) {
          results.push(node);
        }
        const children = node.children ? Array.from(node.children) : [];
        children.forEach(visit);
      };
      visit(root);
      return results;
    };

    const collectNodesByTag = (root, tagName) => {
      const results = [];
      const wantedTag = String(tagName || "").toLowerCase();
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (String(node.tagName || "").toLowerCase() === wantedTag) {
          results.push(node);
        }
        const children = node.children ? Array.from(node.children) : [];
        children.forEach(visit);
      };
      visit(root);
      return results;
    };

    return {
      collectNodesByClass,
      collectNodesByTag,
    };
  };

  return {
    createPrDomTraversalHelpers,
  };
})();
