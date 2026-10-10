// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRowMatchFiltersHelpers fallback.
//
// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): extracted
// verbatim out of index.page.js, where this was an inline function (not
// its own module) sitting next to pr-scope-selection.helpers.js/
// pr-row-filtering.helpers.js's own logic. Pure with respect to its own
// (entry, filters) args - every dependency below is injected, so the
// vanilla side (index.page.js) wires in its existing closures unchanged
// (no behavior change there) while the new reactive useVisiblePrNumbers
// derivation (state/useVisiblePrNumbers.jsx) wires in Context-derived
// equivalents instead (useActorIdentity()'s functions, not index.page.js's
// mutable currentActorLoginAliases/currentViewerLogin module `let`s).
export const { createPrRowMatchFiltersHelpers } = (() => {
  const createPrRowMatchFiltersHelpers = ({
    getPreferredActorKey,
    collectAssignedUsers,
    collectApproversFromRow,
    extractRowLabelNames,
    normalizeFilterToken,
    getManualNotesFieldSummary,
    isInReviewEnabled,
  } = {}) => {
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function" ? getPreferredActorKey : () => "";
    const collectAssignedUsersSafe =
      typeof collectAssignedUsers === "function" ? collectAssignedUsers : () => [];
    const collectApproversFromRowSafe =
      typeof collectApproversFromRow === "function" ? collectApproversFromRow : () => [];
    const extractRowLabelNamesSafe =
      typeof extractRowLabelNames === "function" ? extractRowLabelNames : () => [];
    const normalizeFilterTokenSafe =
      typeof normalizeFilterToken === "function" ? normalizeFilterToken : (value) => value;
    const getManualNotesFieldSummarySafe =
      typeof getManualNotesFieldSummary === "function"
        ? getManualNotesFieldSummary
        : () => ({});
    const isInReviewEnabledSafe =
      typeof isInReviewEnabled === "function" ? isInReviewEnabled : () => false;

    const rowMatchesUiFilters = (entry, filters) => {
      const row = entry?.data || {};
      const labels = extractRowLabelNamesSafe(row)
        .map((label) => normalizeFilterTokenSafe(label))
        .filter(Boolean);
      const prNumber = String(row.number || entry?.prNumber || "").trim();
      const authorLogin = getPreferredActorKeySafe(row.authorLogin, row.author);
      const assignedLogins = collectAssignedUsersSafe(row).map((user) => user.login);
      const approverLogins = collectApproversFromRowSafe(row).map((user) => user.login);

      if (filters.alwaysShowInReview && isInReviewEnabledSafe(row)) {
        return true;
      }

      if (filters.prNumbers.length > 0 && !filters.prNumbers.includes(prNumber)) {
        return false;
      }

      if (filters.prNumbers.length > 0) {
        return true;
      }

      if (
        filters.includeLabels.length > 0 &&
        !filters.includeLabels.some((label) =>
          labels.includes(normalizeFilterTokenSafe(label)),
        )
      ) {
        return false;
      }

      if (
        filters.excludeLabels.length > 0 &&
        filters.excludeLabels.some((label) =>
          labels.includes(normalizeFilterTokenSafe(label)),
        )
      ) {
        return false;
      }

      if (
        filters.authorLogins.length > 0 &&
        !filters.authorLogins.includes(authorLogin)
      ) {
        return false;
      }

      if (
        filters.assignedLogins.length > 0 &&
        !filters.assignedLogins.some((login) => assignedLogins.includes(login))
      ) {
        return false;
      }

      if (
        filters.approverLogins.length > 0 &&
        !filters.approverLogins.some((login) => approverLogins.includes(login))
      ) {
        return false;
      }

      const notesSummary = getManualNotesFieldSummarySafe(entry, row);

      if (filters.customComments === "with" && !notesSummary.hasCustomComments) {
        return false;
      }
      if (filters.customComments === "without" && notesSummary.hasCustomComments) {
        return false;
      }

      if (filters.otherNotes === "with" && !notesSummary.hasOtherNotes) {
        return false;
      }
      if (filters.otherNotes === "without" && notesSummary.hasOtherNotes) {
        return false;
      }

      if (filters.prDifficulty === "not-set" && notesSummary.hasDifficulty) {
        return false;
      }
      if (
        filters.prDifficulty &&
        filters.prDifficulty !== "not-set" &&
        notesSummary.difficultyLevelText !== filters.prDifficulty
      ) {
        return false;
      }

      if (filters.rallyStories === "with" && !notesSummary.hasRallyStories) {
        return false;
      }
      if (filters.rallyStories === "without" && notesSummary.hasRallyStories) {
        return false;
      }

      if (filters.rallyLinks === "with" && !notesSummary.hasRallyLinks) {
        return false;
      }
      if (filters.rallyLinks === "without" && notesSummary.hasRallyLinks) {
        return false;
      }

      if (filters.analysisOfPr === "with" && !notesSummary.hasAnalysisOfPr) {
        return false;
      }
      if (filters.analysisOfPr === "without" && notesSummary.hasAnalysisOfPr) {
        return false;
      }

      return true;
    };

    return {
      rowMatchesUiFilters,
    };
  };

  return {
    createPrRowMatchFiltersHelpers,
  };
})();
