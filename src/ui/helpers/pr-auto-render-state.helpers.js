(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderStateHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderStateHelpers = ({
    getDirtyTrackedFields,
    getUnsavedNotesSections,
    getBlockingPrNumbers,
    getBlockingAuthorInsightsLogins,
    formatBlockingPrNumbersLabel,
  } = {}) => {
    const getDirtyTrackedFieldsSafe =
      typeof getDirtyTrackedFields === "function" ? getDirtyTrackedFields : () => [];
    const getUnsavedNotesSectionsSafe =
      typeof getUnsavedNotesSections === "function"
        ? getUnsavedNotesSections
        : () => [];
    const getBlockingPrNumbersSafe =
      typeof getBlockingPrNumbers === "function" ? getBlockingPrNumbers : () => [];
    const getBlockingAuthorInsightsLoginsSafe =
      typeof getBlockingAuthorInsightsLogins === "function"
        ? getBlockingAuthorInsightsLogins
        : () => [];
    const formatBlockingPrNumbersLabelSafe =
      typeof formatBlockingPrNumbersLabel === "function"
        ? formatBlockingPrNumbersLabel
        : () => "";

    const getAutoRenderBlockingState = () => {
      const dirtyTrackedFields = getDirtyTrackedFieldsSafe();
      const unsavedNotesSections = getUnsavedNotesSectionsSafe();
      const blockingPrNumbers = getBlockingPrNumbersSafe();
      const blockingAuthorInsightsLogins = getBlockingAuthorInsightsLoginsSafe();

      return {
        dirtyFieldCount: Array.isArray(dirtyTrackedFields)
          ? dirtyTrackedFields.length
          : 0,
        unsavedNotesCount: Array.isArray(unsavedNotesSections)
          ? unsavedNotesSections.length
          : 0,
        blockingPrNumbers: Array.isArray(blockingPrNumbers)
          ? blockingPrNumbers
          : [],
        blockingAuthorInsightsLogins: Array.isArray(blockingAuthorInsightsLogins)
          ? blockingAuthorInsightsLogins
          : [],
        blockingPrLabel: formatBlockingPrNumbersLabelSafe(blockingPrNumbers),
      };
    };

    const computeHasDirtyPrSectionsFields = (state = getAutoRenderBlockingState()) => {
      return (
        Number(state?.dirtyFieldCount || 0) > 0 ||
        Number(state?.unsavedNotesCount || 0) > 0 ||
        (Array.isArray(state?.blockingAuthorInsightsLogins) &&
          state.blockingAuthorInsightsLogins.length > 0)
      );
    };

    return {
      getAutoRenderBlockingState,
      computeHasDirtyPrSectionsFields,
    };
  };

  return {
    createPrAutoRenderStateHelpers,
  };
});
