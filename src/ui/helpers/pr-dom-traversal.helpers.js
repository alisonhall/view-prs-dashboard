(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDomTraversalHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
