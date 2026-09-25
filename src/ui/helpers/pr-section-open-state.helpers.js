// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsSectionOpenStateHelpers fallback.
export const { createPrSectionOpenStateHelpers } = (() => {
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
})();
