const createPrAutoRenderStateHelpers = ({
  getUnsavedNotesPrNumbers,
  getBlockingPrNumbers,
  getBlockingAuthorInsightsLogins,
  formatBlockingPrNumbersLabel,
} = {}) => {
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
    const unsavedNotesPrNumbers = getUnsavedNotesPrNumbersSafe();
    const blockingPrNumbers = getBlockingPrNumbersSafe();
    const blockingAuthorInsightsLogins = getBlockingAuthorInsightsLoginsSafe();

    return {
      // Phase H.1 (see REACT_MIGRATION_PLAN.md, "Full migration
      // roadmap"): used to come from getDirtyTrackedFields (a
      // data-original-value DOM scan, confirmed dead - nothing ever set
      // that attribute, so this was always 0 in production). Hardcoded
      // rather than removed - AutoRenderBlockingProvider.jsx/
      // pr-auto-render-indicator.helpers.js still read this field.
      dirtyFieldCount: 0,
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

export { createPrAutoRenderStateHelpers };
