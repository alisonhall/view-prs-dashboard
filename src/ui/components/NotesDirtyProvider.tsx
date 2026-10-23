import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NotesDirtyContext, type NotesDirtyValue } from '../state/NotesDirtyContext';

/**
 * Owns which PR numbers currently have an unsaved Notes edit. Wraps
 * <AppRoot /> from mountAppRoot(), not just the table, so
 * AutoRenderBlockingSync (inside AppRoot, next to the drafts Provider) can
 * read it.
 *
 * Unlike NeedsAttentionProvider (which only *derives* a value from
 * upstream Context), this Provider genuinely owns writable state that
 * descendants call `setNotesDirty` on directly - a normal React update
 * path with no reconciliation-bailout risk, since the state change
 * originates inside this component itself, not from an ancestor's Context
 * value changing underneath a stably-referenced child.
 */
export function NotesDirtyProvider({ children }: { children?: ReactNode }) {
  const [dirtyPrNumberSet, setDirtyPrNumberSet] = useState<Set<string>>(() => new Set());

  const setNotesDirty = useCallback<NotesDirtyValue['setNotesDirty']>((prNumber, isDirty) => {
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
