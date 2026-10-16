import { useCallback, useEffect, useMemo, useState } from 'react';
import { NotesDirtyContext } from '../state/NotesDirtyContext';

/**
 * Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): owns which PR
 * numbers currently have an unsaved Notes edit, replacing the
 * `data-has-unsaved-notes` DOM attribute + direct
 * `window.recomputeDirtyPrSectionsFields()` call every NotesSection
 * instance used to make individually.
 *
 * Unlike NeedsAttentionProvider (which only *derives* a value from
 * upstream Context), this Provider genuinely owns writable state that
 * descendants call `setNotesDirty` on directly - a normal React update
 * path with no reconciliation-bailout risk, since the state change
 * originates inside this component itself, not from an ancestor's Context
 * value changing underneath a stably-referenced child.
 *
 * Publishes `window.getDirtyNotesPrNumbers()` so index.page.js's vanilla
 * auto-render-blocking pipeline (pr-auto-render-unsaved.helpers.js) can
 * read the current dirty set - a dedicated, single-purpose bridge rather
 * than FilterStateProvider's generic window.getFilterStateValues/
 * setFilterStateValue (whose mere existence changes ~25 unrelated fields'
 * restore behavior, per sub-phase 7.4's own finding) - no such risk here,
 * since nothing else reads or writes this bridge name.
 */
export function NotesDirtyProvider({ children }) {
  const [dirtyPrNumberSet, setDirtyPrNumberSet] = useState(() => new Set());

  const setNotesDirty = useCallback((prNumber, isDirty) => {
    const key = String(prNumber || '').trim();
    if (!key) return;
    setDirtyPrNumberSet((previous) => {
      const alreadyDirty = previous.has(key);
      if (isDirty === alreadyDirty) return previous;
      const next = new Set(previous);
      if (isDirty) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const dirtyPrNumbers = useMemo(
    () => Array.from(dirtyPrNumberSet).sort((a, b) => Number(a) - Number(b)),
    [dirtyPrNumberSet],
  );

  useEffect(() => {
    window.getDirtyNotesPrNumbers = () => dirtyPrNumbers;
    window.recomputeDirtyPrSectionsFields?.();
    return () => {
      delete window.getDirtyNotesPrNumbers;
    };
  }, [dirtyPrNumbers]);

  const value = useMemo(() => ({ dirtyPrNumbers, setNotesDirty }), [dirtyPrNumbers, setNotesDirty]);

  return <NotesDirtyContext.Provider value={value}>{children}</NotesDirtyContext.Provider>;
}
