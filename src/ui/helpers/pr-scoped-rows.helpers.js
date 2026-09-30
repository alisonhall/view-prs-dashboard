// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsScopedRowsHelpers fallback.
export const { createPrScopedRowsHelpers } = (() => {
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
})();
