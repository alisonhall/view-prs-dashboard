// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAutoRenderStateHelpers fallback.
export const { createPrAutoRenderStateHelpers } = (() => {
  const createPrAutoRenderStateHelpers = ({
    getDirtyTrackedFields,
    getUnsavedNotesPrNumbers,
    getBlockingPrNumbers,
    getBlockingAuthorInsightsLogins,
    formatBlockingPrNumbersLabel,
  } = {}) => {
    const getDirtyTrackedFieldsSafe =
      typeof getDirtyTrackedFields === "function" ? getDirtyTrackedFields : () => [];
    const getUnsavedNotesPrNumbersSafe =
      typeof getUnsavedNotesPrNumbers === "function"
        ? getUnsavedNotesPrNumbers
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
      const unsavedNotesPrNumbers = getUnsavedNotesPrNumbersSafe();
      const blockingPrNumbers = getBlockingPrNumbersSafe();
      const blockingAuthorInsightsLogins = getBlockingAuthorInsightsLoginsSafe();

      return {
        dirtyFieldCount: Array.isArray(dirtyTrackedFields)
          ? dirtyTrackedFields.length
          : 0,
        unsavedNotesCount: Array.isArray(unsavedNotesPrNumbers)
          ? unsavedNotesPrNumbers.length
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
})();
