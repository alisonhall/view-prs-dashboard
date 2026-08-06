(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsExportPreviewSummaryHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrExportPreviewSummaryHelpers = ({
    getLatestStoredPayload,
    getOptionalElementById,
    getVisiblePrNumbersFromSectionsHost,
    getSelectedExportFieldPaths,
    renderExportSelectionSummary,
    collectNodesByClass,
  } = {}) => {
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function"
        ? getLatestStoredPayload
        : () => ({});
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const getVisiblePrNumbersFromSectionsHostSafe =
      typeof getVisiblePrNumbersFromSectionsHost === "function"
        ? getVisiblePrNumbersFromSectionsHost
        : () => [];
    const getSelectedExportFieldPathsSafe =
      typeof getSelectedExportFieldPaths === "function"
        ? getSelectedExportFieldPaths
        : () => ({ dataPaths: [], userStatePaths: [] });
    const renderExportSelectionSummarySafe =
      typeof renderExportSelectionSummary === "function"
        ? renderExportSelectionSummary
        : () => {};
    const collectNodesByClassSafe =
      typeof collectNodesByClass === "function" ? collectNodesByClass : () => [];

    const collectOpenPrSectionCount = () => {
      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      if (!sectionsHost) return 0;

      return collectNodesByClassSafe(sectionsHost, "pr-group-section").filter(
        (section) => section.open === true,
      ).length;
    };

    const updateExportPreviewSummary = async () => {
      const payload = getLatestStoredPayloadSafe() || {};
      const byPrNumber = payload?.byPrNumber || {};
      const visiblePrNumbers = getVisiblePrNumbersFromSectionsHostSafe(
        getOptionalElementByIdSafe("pr-sections"),
      );
      const selected = getSelectedExportFieldPathsSafe();

      renderExportSelectionSummarySafe({
        dataCount: Array.isArray(selected?.dataPaths) ? selected.dataPaths.length : 0,
        userStateCount: Array.isArray(selected?.userStatePaths)
          ? selected.userStatePaths.length
          : 0,
        visibleCount: visiblePrNumbers.length,
        totalVisibleCount: Object.keys(byPrNumber).length,
        openSectionsCount: collectOpenPrSectionCount(),
      });
    };

    return {
      updateExportPreviewSummary,
      collectOpenPrSectionCount,
    };
  };

  return {
    createPrExportPreviewSummaryHelpers,
  };
});
