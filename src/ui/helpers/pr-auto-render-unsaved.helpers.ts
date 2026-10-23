// Which PRs have unsaved Notes edits, as normalized PR-number strings, for
// the auto-render blocking state. AutoRenderBlockingSync passes in
// NotesDirtyProvider's dirty list; without it nothing counts as dirty.
export interface PrAutoRenderUnsavedDeps {
  getDirtyNotesPrNumbers?: () => unknown;
}

const createPrAutoRenderUnsavedHelpers = ({ getDirtyNotesPrNumbers }: PrAutoRenderUnsavedDeps = {}) => {
  const normalizePrNumber = (value: unknown): string => {
    const normalized = String(value || "").trim();
    return /^\d+$/.test(normalized) ? normalized : "";
  };

  const getDirtyNotesPrNumbersSafe =
    typeof getDirtyNotesPrNumbers === "function" ? getDirtyNotesPrNumbers : () => [];

  const getUnsavedNotesPrNumbers = (): string[] => {
    const raw = getDirtyNotesPrNumbersSafe();
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizePrNumber).filter(Boolean);
  };

  const getBlockingPrNumbers = (): string[] =>
    Array.from(new Set(getUnsavedNotesPrNumbers())).sort((a, b) => Number(a) - Number(b));

  return {
    getUnsavedNotesPrNumbers,
    normalizePrNumber,
    getBlockingPrNumbers,
  };
};

export { createPrAutoRenderUnsavedHelpers };
