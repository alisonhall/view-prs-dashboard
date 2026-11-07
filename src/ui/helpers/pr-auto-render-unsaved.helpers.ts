import { comparePrEntryKeys, isPrEntryKey } from "./pr-entry-keys.helpers.ts";

// Which PRs have unsaved Notes edits, as normalized PR keys, for
// the auto-render blocking state. AutoRenderBlockingSync passes in
// NotesDirtyProvider's dirty list (PR keys, "owner/repo#123"); without it
// nothing counts as dirty.
export interface PrAutoRenderUnsavedDeps {
  getDirtyNotesPrKeys?: () => unknown;
}

const createPrAutoRenderUnsavedHelpers = ({ getDirtyNotesPrKeys }: PrAutoRenderUnsavedDeps = {}) => {
  const normalizePrKey = (value: unknown): string => {
    const normalized = String(value || "").trim();
    return isPrEntryKey(normalized) ? normalized : "";
  };

  const getDirtyNotesPrKeysSafe =
    typeof getDirtyNotesPrKeys === "function" ? getDirtyNotesPrKeys : () => [];

  const getUnsavedNotesPrKeys = (): string[] => {
    const raw = getDirtyNotesPrKeysSafe();
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizePrKey).filter(Boolean);
  };

  const getBlockingPrKeys = (): string[] =>
    Array.from(new Set(getUnsavedNotesPrKeys())).sort(comparePrEntryKeys);

  return {
    getUnsavedNotesPrKeys,
    normalizePrKey,
    getBlockingPrKeys,
  };
};

export { createPrAutoRenderUnsavedHelpers };
