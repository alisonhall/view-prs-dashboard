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

    const buildGroupedPrSections = (rows) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      return {
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
    };

    return {
      buildGroupedPrSections,
    };
  };

  return {
    createPrSectionGroupingHelpers,
  };
});
