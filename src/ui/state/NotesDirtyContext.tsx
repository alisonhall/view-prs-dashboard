import { createContext, useContext } from 'react';

/**
 * Which PR numbers currently have an unsaved PR Notes edit in progress
 * (the detail pane's Notes tab, PrNotesTab). AutoRenderBlockingSync reads
 * it to hold back data refreshes while notes are unsaved, and the pane to
 * mark its Notes tab and ask before switching PRs.
 *
 * `dirtyPrKeys` is a list, not a single boolean: the pane shows one PR
 * at a time, but the list keeps the Context independent of that (and the
 * tests mount several).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - a Notes tab rendered without a <NotesDirtyProvider>
 * ancestor still works, it just never reports dirty state anywhere.
 */
export interface NotesDirtyValue {
  // PR keys ("owner/repo#123" - a bare number would also mark another
  // repo's PR with it), by repo then number.
  dirtyPrKeys: string[];
  setNotesDirty: (prKey: string, isDirty: boolean) => void;
}

export const NotesDirtyContext = createContext<NotesDirtyValue>({
  dirtyPrKeys: [],
  setNotesDirty: () => {},
});

export function useNotesDirty(): NotesDirtyValue {
  return useContext(NotesDirtyContext);
}
