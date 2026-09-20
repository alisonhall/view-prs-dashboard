(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRowSourcesHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRowSourcesHelpers = ({ normalizeRows } = {}) => {
    const normalizeRowsSafe =
      typeof normalizeRows === "function"
        ? normalizeRows
        : (rows) => (Array.isArray(rows) ? rows : []);

    // `repoFilter` is accepted for backward compatibility with existing
    // callers/tests but is intentionally not applied here - PR data for
    // repos other than the currently-configured one should still render
    // (its own row, its own filter-dropdown options via allStoredRows,
    // etc.), not be silently dropped. `repoFilter` still drives repo-scoped
    // *labeling* (the applied-filters summary text) and stats/insights
    // scoping elsewhere - only row visibility is unconditional now.
    const deriveRowSources = ({ allEntries, repoFilter: _repoFilter } = {}) => {
      const safeEntries = Array.isArray(allEntries) ? allEntries : [];

      return {
        rowsForRepo: safeEntries,
        allStoredRows: normalizeRowsSafe(safeEntries),
      };
    };

    return {
      deriveRowSources,
    };
  };

  return {
    createPrRowSourcesHelpers,
  };
});
