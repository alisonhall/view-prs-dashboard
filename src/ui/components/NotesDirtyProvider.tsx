import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { comparePrEntryKeys } from '../helpers/pr-entry-keys.helpers.ts';
import { NotesDirtyContext, type NotesDirtyValue } from '../state/NotesDirtyContext';

/**
 * Owns which PR numbers currently have an unsaved Notes edit. Wraps
 * <AppShell /> in react-app.tsx, not just the table, so
 * AutoRenderBlockingSync (next to the drafts Provider, in react-app.tsx)
 * can read it.
 *
 * Unlike NeedsAttentionProvider (which only *derives* a value from
 * upstream Context), this Provider genuinely owns writable state that
 * descendants call `setNotesDirty` on directly - a normal React update
 * path with no reconciliation-bailout risk, since the state change
 * originates inside this component itself, not from an ancestor's Context
 * value changing underneath a stably-referenced child.
 */
export function NotesDirtyProvider({ children }: { children?: ReactNode }) {
  const [dirtyPrKeySet, setDirtyPrKeySet] = useState<Set<string>>(() => new Set());

  const setNotesDirty = useCallback<NotesDirtyValue['setNotesDirty']>((prKey, isDirty) => {
    const key = String(prKey || '').trim();
    if (!key) return;
    setDirtyPrKeySet((previous) => {
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

  const dirtyPrKeys = useMemo(
    () => Array.from(dirtyPrKeySet).sort(comparePrEntryKeys),
    [dirtyPrKeySet],
  );

  const value = useMemo(() => ({ dirtyPrKeys, setNotesDirty }), [dirtyPrKeys, setNotesDirty]);

  return <NotesDirtyContext.Provider value={value}>{children}</NotesDirtyContext.Provider>;
}
