// The auto-render blocking state (AutoRenderBlockingSync/Provider): which
// unsaved notes and author-insight drafts are holding back automatic data
// refreshes, built from the injected getters.
export interface PrAutoRenderStateDeps {
  getUnsavedNotesPrKeys?: () => unknown;
  getBlockingPrKeys?: () => unknown;
  getBlockingAuthorInsightsLogins?: () => unknown;
  formatBlockingPrKeysLabel?: (prNumbers: unknown) => string;
}

export interface AutoRenderBlockingState {
  dirtyFieldCount: number;
  unsavedNotesCount: number;
  blockingPrKeys: string[];
  blockingAuthorInsightsLogins: string[];
  blockingPrLabel: string;
}

const createPrAutoRenderStateHelpers = ({
  getUnsavedNotesPrKeys,
  getBlockingPrKeys,
  getBlockingAuthorInsightsLogins,
  formatBlockingPrKeysLabel,
}: PrAutoRenderStateDeps = {}) => {
  const getUnsavedNotesPrKeysSafe =
    typeof getUnsavedNotesPrKeys === "function"
      ? getUnsavedNotesPrKeys
      : () => [];
  const getBlockingPrKeysSafe =
    typeof getBlockingPrKeys === "function" ? getBlockingPrKeys : () => [];
  const getBlockingAuthorInsightsLoginsSafe =
    typeof getBlockingAuthorInsightsLogins === "function"
      ? getBlockingAuthorInsightsLogins
      : () => [];
  const formatBlockingPrKeysLabelSafe =
    typeof formatBlockingPrKeysLabel === "function"
      ? formatBlockingPrKeysLabel
      : () => "";

  const getAutoRenderBlockingState = (): AutoRenderBlockingState => {
    const unsavedNotesPrKeys = getUnsavedNotesPrKeysSafe();
    const blockingPrKeys = getBlockingPrKeysSafe();
    const blockingAuthorInsightsLogins = getBlockingAuthorInsightsLoginsSafe();

    return {
      // Always 0: it used to count a DOM scan that never found anything.
      // Kept because AutoRenderBlockingProvider and
      // pr-auto-render-indicator.helpers.ts still read the field.
      dirtyFieldCount: 0,
      unsavedNotesCount: Array.isArray(unsavedNotesPrKeys)
        ? unsavedNotesPrKeys.length
        : 0,
      blockingPrKeys: Array.isArray(blockingPrKeys)
        ? blockingPrKeys
        : [],
      blockingAuthorInsightsLogins: Array.isArray(blockingAuthorInsightsLogins)
        ? blockingAuthorInsightsLogins
        : [],
      blockingPrLabel: formatBlockingPrKeysLabelSafe(blockingPrKeys),
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
