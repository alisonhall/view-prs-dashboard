import { createContext, useContext } from 'react';

/**
 * Which PR numbers currently have an unsaved PR Notes edit in progress
 * (the detail pane's Notes tab, PrNotesTab). AutoRenderBlockingSync reads
 * it to hold back data refreshes while notes are unsaved, and the pane to
 * mark its Notes tab and ask before switching PRs.
 *
 * `dirtyPrNumbers` is a list, not a single boolean: the pane shows one PR
 * at a time, but the list keeps the Context independent of that (and the
 * tests mount several).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - a Notes tab rendered without a <NotesDirtyProvider>
 * ancestor still works, it just never reports dirty state anywhere.
 */
export interface NotesDirtyValue {
  // Sorted numerically.
  dirtyPrNumbers: string[];
  setNotesDirty: (prNumber: string | number, isDirty: boolean) => void;
}

export const NotesDirtyContext = createContext<NotesDirtyValue>({
  dirtyPrNumbers: [],
  setNotesDirty: () => {},
});

export function useNotesDirty(): NotesDirtyValue {
  return useContext(NotesDirtyContext);
}
