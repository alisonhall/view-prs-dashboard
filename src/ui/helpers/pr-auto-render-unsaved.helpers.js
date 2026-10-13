// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAutoRenderUnsavedHelpers fallback.
//
// Phase H.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): used
// to also own getDirtyTrackedFields (a data-original-value DOM scan under
// #pr-sections), getBlockingPrNumberForElement, and
// getFirstUnsavedElementForPrNumber - deleted outright, confirmed dead
// (nothing anywhere in src/ui ever sets data-original-value, so the scan
// always returned []; getFirstUnsavedElementForPrNumber had already lost
// its only real caller back in Phase G.1, per index.page.js's own comment
// there, but the function itself was left behind until now).
export const { createPrAutoRenderUnsavedHelpers } = (() => {
  const createPrAutoRenderUnsavedHelpers = ({
    // Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): PR Notes'
    // dirty-section tracking moved from a DOM data-attribute scan
    // (data-has-unsaved-notes) to NotesDirtyProvider.jsx's own React state,
    // read here via a dedicated window bridge
    // (pr-pending-multi-select-selections.helpers.js-style - a narrow,
    // single-purpose channel, not FilterStateProvider's generic one).
    // Optional and defaults to "nothing dirty" so every existing call site/
    // unit test keeps working unmodified before the provider has mounted.
    getDirtyNotesPrNumbers,
  } = {}) => {
    const normalizePrNumber = (value) => {
      const normalized = String(value || "").trim();
      return /^\d+$/.test(normalized) ? normalized : "";
    };

    const getDirtyNotesPrNumbersSafe =
      typeof getDirtyNotesPrNumbers === "function" ? getDirtyNotesPrNumbers : () => [];

    const getUnsavedNotesPrNumbers = () => {
      const raw = getDirtyNotesPrNumbersSafe();
      if (!Array.isArray(raw)) return [];
      return raw.map(normalizePrNumber).filter(Boolean);
    };

    const getBlockingPrNumbers = () =>
      Array.from(new Set(getUnsavedNotesPrNumbers())).sort((a, b) => Number(a) - Number(b));

    return {
      getUnsavedNotesPrNumbers,
      normalizePrNumber,
      getBlockingPrNumbers,
    };
  };

  return {
    createPrAutoRenderUnsavedHelpers,
  };
})();
