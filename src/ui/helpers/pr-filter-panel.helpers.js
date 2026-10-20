// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsFilterPanelHelpers fallback.
//
// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): the 5
// populateXOptions functions this factory used to own (populateIncludeLabelOptions/
// populateExcludeLabelOptions/populateAuthorOptions/populateAssignedOptions/
// populateApproverOptions, plus their shared collectSortedLabelOptions
// helper) have moved to FilterOptionsProvider.jsx, which derives the same
// option lists reactively from PrDataContext instead of having them pushed
// imperatively through here. Phase H.12 (see REACT_MIGRATION_PLAN.md, "Full
// migration roadmap"): the applied-filter summary (renderManagementFilterSummary/
// renderFilterSummary) is gone too - confirmed dead in production
// (AppliedFilterSummaryLive, react-app.jsx, already owns the same "Applied
// filters: ..." summary/chips live, reactively; this factory's own version
// had no real installer left to call through to).
// Cleanup pass (prompted by a direct question about leftover vanilla code,
// see REACT_MIGRATION_PLAN.md): the 11 selection/metadata-filter getters
// this factory used to also keep (getSelectedAuthorLogins/
// getSelectedAssignedLogins/getSelectedApproverLogins/
// getSelectedIncludeLabelNames/getSelectedExcludeLabelNames/
// getCustomCommentsFilter/getOtherNotesFilter/getPrDifficultyFilter/
// getRallyStoriesFilter/getRallyLinksFilter/getAnalysisOfPrFilter, plus the
// getFilterStateValue DI param and getSelectedMultiSelectValues/
// readFilterStateOrDomValue internals they alone used) are deleted outright
// - index.page.js's own comment claiming they were "still genuinely needed
// by createPrFilterSelectionInputsHelpers' own instance" was stale:
// createPrFilterSelectionInputsHelpers doesn't exist anywhere in this
// codebase any more (confirmed via grep), and index.page.js's own
// destructuring of this factory already only pulled out
// setupMultiSelectDropdownClosing - every one of these 11 getters had zero
// real caller left, exercised only by this file's own now-deleted unit
// tests. Only the dropdown-closing listener survives.
export const { createPrFilterPanelHelpers } = (() => {
  const createPrFilterPanelHelpers = ({ documentRef } = {}) => {
    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const setupMultiSelectDropdownClosing = () => {
      const doc = getDocument();
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      const dropdowns = doc.querySelectorAll(".multi-select-dropdown");
      if (dropdowns.length === 0) return;

      doc.addEventListener("click", (event) => {
        dropdowns.forEach((dropdown) => {
          if (!dropdown.contains(event.target)) {
            dropdown.open = false;
          }
        });
      });
    };

    return {
      setupMultiSelectDropdownClosing,
    };
  };

  return {
    createPrFilterPanelHelpers,
  };
})();
