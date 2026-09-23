(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionGroupingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionGroupingHelpers = ({
    sortRowsByPrNumberDesc,
    sortRowsByDateFieldDesc,
  } = {}) => {
    const sortRowsByPrNumberDescSafe =
      typeof sortRowsByPrNumberDesc === "function"
        ? sortRowsByPrNumberDesc
        : (value) => (Array.isArray(value) ? value : []);
    const sortRowsByDateFieldDescSafe =
      typeof sortRowsByDateFieldDesc === "function"
        ? sortRowsByDateFieldDesc
        : (value) => (Array.isArray(value) ? value : []);

    // Phase 5 residual (see REACT_MIGRATION_PLAN.md): this used to
    // re-filter and re-sort every stored row on every call, regardless of
    // whether anything actually changed since the last call. Skips that
    // work when `rows` is reference-identical (same length, same entry at
    // every position) to the last call - safe because an unchanged PR
    // entry keeps stable object identity across polls (see
    // pr-entry-derived-cache.helpers.js's own documented guarantee, relied
    // on the same way here); any real change means a different reference
    // at that position, so this only ever skips when nothing that could
    // affect grouping/sorting changed. Worst case (a miss) behaves
    // identically to before.
    let lastRows = null;
    let lastResult = null;

    const rowsUnchanged = (rows) => {
      if (!lastRows || rows.length !== lastRows.length) {
        return false;
      }
      for (let index = 0; index < rows.length; index += 1) {
        if (rows[index] !== lastRows[index]) {
          return false;
        }
      }
      return true;
    };

    const buildGroupedPrSections = (rows) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      if (rowsUnchanged(safeRows)) {
        return lastResult;
      }

      const result = {
        open: sortRowsByPrNumberDescSafe(
          safeRows.filter((entry) => entry.section === "open"),
        ),
        draft: sortRowsByPrNumberDescSafe(
          safeRows.filter((entry) => entry.section === "draft"),
        ),
        closed: sortRowsByDateFieldDescSafe(
          safeRows.filter((entry) => entry.section === "closed"),
          "closedAt",
        ),
        merged: sortRowsByDateFieldDescSafe(
          safeRows.filter((entry) => entry.section === "merged"),
          "mergedAt",
        ),
      };
      lastRows = safeRows;
      lastResult = result;
      return result;
    };

    return {
      buildGroupedPrSections,
    };
  };

  return {
    createPrSectionGroupingHelpers,
  };
});
