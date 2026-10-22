import { useCallback, useMemo, useState } from 'react';
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
 * Window-bridge elimination Phase 7.4: AutoRenderBlockingSync.jsx reads
 * `dirtyPrNumbers` from this Context to compute the auto-render-blocking
 * state. This Provider used to publish it as window.getDirtyNotesPrNumbers
 * and call window.recomputeDirtyPrSectionsFields (index.page.js) on each
 * change. It now wraps <AppRoot /> from mountAppRoot(), not just the table,
 * so the sync component (inside AppRoot, next to the drafts Provider) can
 * read it. window.getDirtyNotesPrNumbers, kept for a while as a test-only
 * observer, is deleted (tests read the Context).
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

  const value = useMemo(() => ({ dirtyPrNumbers, setNotesDirty }), [dirtyPrNumbers, setNotesDirty]);

  return <NotesDirtyContext.Provider value={value}>{children}</NotesDirtyContext.Provider>;
}
