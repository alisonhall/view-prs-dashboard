(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionOpenStateHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionOpenStateHelpers = ({
    collectNodesByClass,
    readElementAttribute,
  } = {}) => {
    const collectNodesByClassSafe =
      typeof collectNodesByClass === "function" ? collectNodesByClass : () => [];
    const readElementAttributeSafe =
      typeof readElementAttribute === "function"
        ? readElementAttribute
        : () => "";

    const capturePrSectionOpenState = (sectionsHost) => {
      const openState = new Map();
      collectNodesByClassSafe(sectionsHost, "pr-group-section").forEach(
        (section) => {
          const key = readElementAttributeSafe(section, "data-pr-section").trim();
          if (!key) return;
          openState.set(key, section.open === true);
        },
      );
      return openState;
    };

    const resolvePrSectionOpenState = (openState, sectionKey, fallbackOpen) => {
      if (openState instanceof Map && openState.has(sectionKey)) {
        return openState.get(sectionKey) === true;
      }
      return fallbackOpen;
    };

    return {
      capturePrSectionOpenState,
      resolvePrSectionOpenState,
    };
  };

  return {
    createPrSectionOpenStateHelpers,
  };
});
