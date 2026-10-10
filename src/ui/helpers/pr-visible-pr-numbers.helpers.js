// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs.
//
// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): the one
// genuinely new piece of logic for making the PR table's visible-row
// computation a reactive Context derivation instead of only running on an
// explicit "Apply filters" click. Composes the same pure helpers the
// vanilla pipeline uses (resolveScopedRows/buildRowFilterCriteria/
// applyRowUiFilters/rowMatchesUiFilters, all injected, not reimplemented)
// into one function callable from a React useMemo - see
// state/useVisiblePrNumbers.jsx for the hook that wires it to Context.
// Returns `{ visiblePrNumbers, scopeLabel }` (not a bare array) - the
// Applied-filters-chip-text follow-up (state/useAppliedFilterSummary.jsx)
// needs `scopeLabel` too, and it falls out of the same scope-resolution
// pass this already runs, so it's returned alongside rather than needing
// a second, separate call that redoes that work.
export const { createPrVisiblePrNumbersHelpers } = (() => {
  const parseCsvTokens = (rawValue) =>
    String(rawValue || "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

  const createPrVisiblePrNumbersHelpers = ({
    resolveScopedRows,
    normalizeSelectedScope,
    buildRowFilterCriteria,
    applyRowUiFilters,
  } = {}) => {
    const resolveScopedRowsSafe =
      typeof resolveScopedRows === "function"
        ? resolveScopedRows
        : ({ rowsForRepo }) => ({
            rows: Array.isArray(rowsForRepo) ? rowsForRepo : [],
            scopeLabel: "all stored rows",
          });
    const normalizeSelectedScopeSafe =
      typeof normalizeSelectedScope === "function" ? normalizeSelectedScope : () => "all";
    const buildRowFilterCriteriaSafe =
      typeof buildRowFilterCriteria === "function" ? buildRowFilterCriteria : (input) => input;
    const applyRowUiFiltersSafe =
      typeof applyRowUiFilters === "function" ? applyRowUiFilters : (rows) => rows;

    const computeVisiblePrNumbers = ({
      payload,
      scopeMode,
      filterPrNumbersRaw,
      attentionConfig,
      rowFilterSelections = {},
      alwaysShowInReview,
      customComments,
      otherNotes,
      prDifficulty,
      rallyStories,
      rallyLinks,
      analysisOfPr,
    } = {}) => {
      const allEntries = Object.values(payload?.byPrNumber || {});
      const lastRun = payload?.lastRun || null;
      const runStamp = String(lastRun?.updatedAt || "").trim();

      const filterPrNumbers = parseCsvTokens(filterPrNumbersRaw)
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d+$/.test(value));

      const selectedScope = normalizeSelectedScopeSafe(scopeMode);
      const ignoreScopeForPrNumberFilter = filterPrNumbers.length > 0;
      const useLastRunScope = selectedScope === "last-run";

      const { rows: scopedRows, scopeLabel } = resolveScopedRowsSafe({
        rowsForRepo: allEntries,
        ignoreScopeForPrNumberFilter,
        runStamp,
        useLastRunScope,
        selectedScope,
        attentionConfig,
      });

      const criteria = buildRowFilterCriteriaSafe({
        prNumbers: filterPrNumbers,
        includeLabels: rowFilterSelections.includeLabels,
        excludeLabels: rowFilterSelections.excludeLabels,
        authorLogins: rowFilterSelections.authorLogins,
        assignedLogins: rowFilterSelections.assignedLogins,
        approverLogins: rowFilterSelections.approverLogins,
        alwaysShowInReview,
        customComments,
        otherNotes,
        prDifficulty,
        rallyStories,
        rallyLinks,
        analysisOfPr,
      });

      const filteredRows = applyRowUiFiltersSafe(scopedRows, criteria);

      const visiblePrNumbers = filteredRows
        .map((entry) => String(entry?.data?.number ?? entry?.prNumber ?? ""))
        .filter(Boolean);

      return { visiblePrNumbers, scopeLabel };
    };

    return {
      computeVisiblePrNumbers,
    };
  };

  return {
    createPrVisiblePrNumbersHelpers,
  };
})();
