// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsPrNotesHelpers fallback.
export const { createPrNotesHelpers } = (() => {
  const normalizeNotesListForUi = (value) => {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => String(item ?? ""))
        .filter((item) => item.length > 0);
      return normalized.length ? normalized : [""];
    }
    const single = String(value ?? "");
    return single ? [single] : [""];
  };

  const createPrNotesHelpers = () => ({
    normalizeNotesListForUi,
  });

  return {
    createPrNotesHelpers,
  };
})();
