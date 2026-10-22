const createPrRowFilteringHelpers = ({
  rowMatchesUiFilters,
  getOrCompute,
  getOrComputeLatest,
} = {}) => {
  const rowMatchesUiFiltersSafe =
    typeof rowMatchesUiFilters === "function"
      ? rowMatchesUiFilters
      : () => true;
  // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
  // defaults to an uncached passthrough so callers/tests that don't wire
  // a shared cache in keep working exactly as before - the cache is
  // purely a perf optimization, never required for correctness.
  const getOrComputeSafe =
    typeof getOrCompute === "function" ? getOrCompute : (_entry, _key, compute) => compute();

  const buildRowFilterCriteria = ({
    prNumbers,
    includeLabels,
    excludeLabels,
    authorLogins,
    assignedLogins,
    approverLogins,
    alwaysShowInReview,
    customComments,
    otherNotes,
    prDifficulty,
    rallyStories,
    rallyLinks,
    analysisOfPr,
  } = {}) => ({
    prNumbers: Array.isArray(prNumbers) ? prNumbers : [],
    includeLabels: Array.isArray(includeLabels) ? includeLabels : [],
    excludeLabels: Array.isArray(excludeLabels) ? excludeLabels : [],
    authorLogins: Array.isArray(authorLogins) ? authorLogins : [],
    assignedLogins: Array.isArray(assignedLogins) ? assignedLogins : [],
    approverLogins: Array.isArray(approverLogins) ? approverLogins : [],
    alwaysShowInReview: Boolean(alwaysShowInReview),
    customComments: String(customComments || ""),
    otherNotes: String(otherNotes || ""),
    prDifficulty: String(prDifficulty || ""),
    rallyStories: String(rallyStories || ""),
    rallyLinks: String(rallyLinks || ""),
    analysisOfPr: String(analysisOfPr || ""),
  });

  const applyRowUiFilters = (rows, criteria) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    // Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"):
    // rowMatchesUiFilters is a fairly expensive, many-condition
    // predicate re-run for every entry on every render regardless of
    // how many entries (or filters) actually changed - the dominant,
    // measured cost behind the shared render pipeline being flat
    // regardless of delta size. Caching per (entry, current filter
    // criteria) means an *unchanged* entry's match result is reused
    // instead of recomputed - correctness is unaffected (a changed
    // entry is a different object reference/cache miss; a changed
    // filter selection changes filtersFingerprint, busting every
    // entry's cached result for it) while an actual delta-changed
    // subset of entries does real new work.
    //
    // Only the latest criteria's result is kept per entry
    // (getOrComputeLatest), NOT one result per fingerprint ever seen:
    // the 6 free-text filter fields are undebounced, so every keystroke
    // is a new fingerprint, and a key-per-fingerprint cache grew by one
    // permanent result per keystroke per loaded PR until Chrome killed
    // the renderer ("Error code: 5"). Callers that only inject a plain
    // getOrCompute (no getOrComputeLatest) still get the old
    // key-per-fingerprint behavior, which is unbounded - wire both.
    const filtersFingerprint = JSON.stringify(criteria);
    return safeRows.filter((entry) =>
      typeof getOrComputeLatest === "function"
        ? getOrComputeLatest(entry, "filterMatch", filtersFingerprint, () =>
            rowMatchesUiFiltersSafe(entry, criteria),
          )
        : getOrComputeSafe(entry, `filterMatch:${filtersFingerprint}`, () =>
            rowMatchesUiFiltersSafe(entry, criteria),
          ),
    );
  };

  return {
    buildRowFilterCriteria,
    applyRowUiFilters,
  };
};

export { createPrRowFilteringHelpers };
