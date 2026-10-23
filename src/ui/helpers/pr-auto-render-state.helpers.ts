// The auto-render blocking state (AutoRenderBlockingSync/Provider): which
// unsaved notes and author-insight drafts are holding back automatic data
// refreshes, built from the injected getters.
export interface PrAutoRenderStateDeps {
  getUnsavedNotesPrNumbers?: () => unknown;
  getBlockingPrNumbers?: () => unknown;
  getBlockingAuthorInsightsLogins?: () => unknown;
  formatBlockingPrNumbersLabel?: (prNumbers: unknown) => string;
}

export interface AutoRenderBlockingState {
  dirtyFieldCount: number;
  unsavedNotesCount: number;
  blockingPrNumbers: string[];
  blockingAuthorInsightsLogins: string[];
  blockingPrLabel: string;
}

const createPrAutoRenderStateHelpers = ({
  getUnsavedNotesPrNumbers,
  getBlockingPrNumbers,
  getBlockingAuthorInsightsLogins,
  formatBlockingPrNumbersLabel,
}: PrAutoRenderStateDeps = {}) => {
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

  const getAutoRenderBlockingState = (): AutoRenderBlockingState => {
    const unsavedNotesPrNumbers = getUnsavedNotesPrNumbersSafe();
    const blockingPrNumbers = getBlockingPrNumbersSafe();
    const blockingAuthorInsightsLogins = getBlockingAuthorInsightsLoginsSafe();

    return {
      // Always 0: it used to count a DOM scan that never found anything.
      // Kept because AutoRenderBlockingProvider and
      // pr-auto-render-indicator.helpers.ts still read the field.
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

  const computeHasDirtyPrSectionsFields = (
    state: Partial<AutoRenderBlockingState> | null | undefined = getAutoRenderBlockingState(),
  ): boolean => {
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
