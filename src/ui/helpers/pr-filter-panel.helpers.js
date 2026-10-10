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
// imperatively through here - trimmed this factory's DI surface and return
// value down to what's still used: reading the currently-checked selection
// out of a list (still needed at "Apply filters (local)" time and by
// persistUiOptionOverrides), the 6 "Any (with/without)" metadata filter
// getters, the applied-filter summary, and the dropdown-closing listener.
export const { createPrFilterPanelHelpers } = (() => {
  const createPrFilterPanelHelpers = ({
    // Renders the "Applied filters: ..." summary line + chip list via React
    // (react-app.jsx's renderReactFilterSummary, mounted into
    // #management-filter-summary-root - see AppliedFilterSummary.jsx).
    // Optional and defaults to a no-op so every existing call site/unit
    // test keeps working unmodified before React has mounted it.
    renderFilterSummary,
    documentRef,
    // Phase 6 (see REACT_MIGRATION_PLAN.md): optional - when provided,
    // returns a migrated field's current value from FilterStateProvider's
    // Context by its Context key (not DOM id), or undefined for an
    // unmigrated key/before the provider mounts. Defaults to always
    // undefined so every existing call site (and every existing unit
    // test, which doesn't pass this) falls back to its original DOM read
    // unchanged.
    getFilterStateValue,
  } = {}) => {
    const getFilterStateValueSafe =
      typeof getFilterStateValue === "function" ? getFilterStateValue : () => undefined;
    const renderFilterSummarySafe =
      typeof renderFilterSummary === "function" ? renderFilterSummary : () => false;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const getListElement = (listId) => {
      const doc = getDocument();
      if (!doc || typeof doc.getElementById !== "function") {
        return null;
      }
      return doc.getElementById(listId);
    };

    const getSelectedMultiSelectValues = (listId) => {
      const list = getListElement(listId);
      if (!list || typeof list.querySelectorAll !== "function") return [];

      const checkboxes = Array.from(
        list.querySelectorAll("input[type='checkbox']:checked"),
      );
      return checkboxes
        .map((checkbox) => String(checkbox.value || "").trim())
        .filter(Boolean);
    };

    const getSelectedAuthorLogins = () => getSelectedMultiSelectValues("author-list");
    const getSelectedAssignedLogins = () =>
      getSelectedMultiSelectValues("assigned-list");
    const getSelectedApproverLogins = () =>
      getSelectedMultiSelectValues("approver-list");
    const getSelectedIncludeLabelNames = () =>
      getSelectedMultiSelectValues("label-list");
    const getSelectedExcludeLabelNames = () =>
      getSelectedMultiSelectValues("exclude-label-list");

    // Phase 6 (see REACT_MIGRATION_PLAN.md): each of these six "Any
    // (with/without)" filters prefers its migrated value via
    // getFilterStateValueSafe (Context key, not DOM id) over the DOM read,
    // same handled/fallback shape as every other bridge in this
    // migration.
    const readFilterStateOrDomValue = (contextKey, domId) => {
      const override = getFilterStateValueSafe(contextKey);
      if (typeof override === "string") {
        return override.trim();
      }
      const doc = getDocument();
      const element = doc?.getElementById(domId);
      return String(element?.value || "").trim();
    };

    const getCustomCommentsFilter = () =>
      readFilterStateOrDomValue("filterCustomComments", "filter-custom-comments");
    const getOtherNotesFilter = () =>
      readFilterStateOrDomValue("filterOtherNotes", "filter-other-notes");
    const getPrDifficultyFilter = () =>
      readFilterStateOrDomValue("filterPrDifficulty", "filter-pr-difficulty");
    const getRallyStoriesFilter = () =>
      readFilterStateOrDomValue("filterRallyStories", "filter-rally-stories");
    const getRallyLinksFilter = () =>
      readFilterStateOrDomValue("filterRallyLinks", "filter-rally-links");
    const getAnalysisOfPrFilter = () =>
      readFilterStateOrDomValue("filterAnalysisOfPr", "filter-analysis-of-pr");

    const renderManagementFilterSummary = ({
      summaryText = "",
      filterChips = [],
    } = {}) => {
      renderFilterSummarySafe(summaryText, filterChips);
    };

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
      getSelectedAuthorLogins,
      getSelectedAssignedLogins,
      getSelectedApproverLogins,
      getSelectedIncludeLabelNames,
      getSelectedExcludeLabelNames,
      getCustomCommentsFilter,
      getOtherNotesFilter,
      getPrDifficultyFilter,
      getRallyStoriesFilter,
      getRallyLinksFilter,
      getAnalysisOfPrFilter,
      renderManagementFilterSummary,
      setupMultiSelectDropdownClosing,
    };
  };

  return {
    createPrFilterPanelHelpers,
  };
})();
