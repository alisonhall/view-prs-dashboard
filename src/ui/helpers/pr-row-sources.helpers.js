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

    const deriveRowSources = ({ allEntries, repoFilter } = {}) => {
      const safeEntries = Array.isArray(allEntries) ? allEntries : [];
      const rowsForRepo = safeEntries.filter(
        (entry) => !repoFilter || entry?.repo === repoFilter,
      );

      return {
        rowsForRepo,
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
