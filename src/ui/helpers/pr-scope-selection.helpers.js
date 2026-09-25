// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsScopeSelectionHelpers fallback.
export const { createPrScopeSelectionHelpers } = (() => {
  const createPrScopeSelectionHelpers = ({
    entryNeedsAttention,
    entryHasYourLastActivity,
  } = {}) => {
    const entryNeedsAttentionSafe =
      typeof entryNeedsAttention === "function"
        ? entryNeedsAttention
        : () => false;
    const entryHasYourLastActivitySafe =
      typeof entryHasYourLastActivity === "function"
        ? entryHasYourLastActivity
        : () => false;

    const normalizeSelectedScope = (scopeModeValue) => {
      const normalizedValue = String(scopeModeValue || "all")
        .trim()
        .toLowerCase();
      return [
        "all",
        "last-run",
        "needs-attention",
        "needs-attention-or-interacted",
      ].includes(normalizedValue)
        ? normalizedValue
        : "all";
    };

    const resolveScopedRows = ({
      rowsForRepo,
      ignoreScopeForPrNumberFilter,
      runStamp,
      useLastRunScope,
      selectedScope,
      attentionConfig,
    } = {}) => {
      let rows = Array.isArray(rowsForRepo) ? rowsForRepo : [];
      let scopeLabel = "all stored rows";

      if (!ignoreScopeForPrNumberFilter) {
        if (runStamp && useLastRunScope) {
          const lastRunRows = rows.filter((entry) => entry?.updatedAt === runStamp);
          if (lastRunRows.length > 0) {
            rows = lastRunRows;
            scopeLabel = "last run rows";
          }
        } else if (selectedScope === "needs-attention") {
          rows = rows.filter((entry) =>
            entryNeedsAttentionSafe(entry, attentionConfig),
          );
          scopeLabel = "needs attention rows";
        } else if (selectedScope === "needs-attention-or-interacted") {
          rows = rows.filter(
            (entry) =>
              entryNeedsAttentionSafe(entry, attentionConfig) ||
              entryHasYourLastActivitySafe(entry),
          );
          scopeLabel = "needs attention or interacted rows";
        }
      }

      return {
        rows,
        scopeLabel,
      };
    };

    return {
      normalizeSelectedScope,
      resolveScopedRows,
    };
  };

  return {
    createPrScopeSelectionHelpers,
  };
})();
