// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsFilterOptionsHelpers fallback.
export const { createPrFilterOptionsHelpers } = (() => {
  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): every populate
  // function this used to orchestrate (5 in pr-filter-panel.helpers.js, 2
  // in index.page.js) has moved to FilterOptionsProvider.jsx, deriving the
  // same 9 multiselect option lists reactively from PrDataContext instead
  // of being pushed imperatively through this pipeline.
  // populateFilterOptions is kept as a permanent no-op shell since its
  // caller (deriveViewerFilterSetup, part of renderPrData's still-vanilla
  // pipeline) can't be deleted yet - see REACT_MIGRATION_PLAN.md's
  // sub-phase 7.2 writeup for why renderPrData itself is still needed.
  const createPrFilterOptionsHelpers = () => {
    const populateFilterOptions = () => {};

    return {
      populateFilterOptions,
    };
  };

  return {
    createPrFilterOptionsHelpers,
  };
})();
