import { createContext, useContext } from 'react';

/**
 * Which PR numbers currently have an unsaved PR Notes edit in progress
 * (NotesSection.jsx). AutoRenderBlockingSync reads it to hold back data
 * refreshes while notes are unsaved.
 *
 * `dirtyPrNumbers` is a list, not a single boolean, since multiple
 * NotesSection instances can be dirty at once (PrTableApp.jsx's
 * `expandedInsights` is a map, not a single "open row" - more than one
 * row's insights panel can be expanded simultaneously).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - a NotesSection rendered without a <NotesDirtyProvider>
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
