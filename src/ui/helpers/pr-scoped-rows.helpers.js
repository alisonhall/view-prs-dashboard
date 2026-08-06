(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsScopedRowsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrScopedRowsHelpers = ({ resolveScopedRows, normalizeRows } = {}) => {
    const resolveScopedRowsSafe =
      typeof resolveScopedRows === "function"
        ? resolveScopedRows
        : () => ({ rows: [], scopeLabel: "all stored rows" });
    const normalizeRowsSafe =
      typeof normalizeRows === "function"
        ? normalizeRows
        : (rows) => (Array.isArray(rows) ? rows : []);

    const deriveScopedRows = ({
      rowsForRepo,
      ignoreScopeForPrNumberFilter,
      runStamp,
      useLastRunScope,
      selectedScope,
      attentionConfig,
    } = {}) => {
      const { rows: scopedRows, scopeLabel } = resolveScopedRowsSafe({
        rowsForRepo,
        ignoreScopeForPrNumberFilter,
        runStamp,
        useLastRunScope,
        selectedScope,
        attentionConfig,
      });

      return {
        rows: normalizeRowsSafe(scopedRows),
        scopeLabel,
      };
    };

    return {
      deriveScopedRows,
    };
  };

  return {
    createPrScopedRowsHelpers,
  };
});
