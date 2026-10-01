import { createContext, useContext } from 'react';

/**
 * Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): which PR numbers
 * currently have an unsaved PR Notes edit in progress (NotesSection.jsx),
 * replacing the `data-has-unsaved-notes` DOM attribute + direct
 * `window.recomputeDirtyPrSectionsFields()` call every NotesSection
 * instance used to make individually.
 *
 * `dirtyPrNumbers` is a list, not a single boolean, since multiple
 * NotesSection instances can be dirty at once (PrTableApp.jsx's
 * `expandedInsights` is a map, not a single "open row" - more than one
 * row's insights panel can be expanded simultaneously).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration - a NotesSection rendered without a
 * <NotesDirtyProvider> ancestor still works, it just never reports dirty
 * state anywhere.
 */
export const NotesDirtyContext = createContext({
  dirtyPrNumbers: [],
  setNotesDirty: () => {},
});

export function useNotesDirty() {
  return useContext(NotesDirtyContext);
}
