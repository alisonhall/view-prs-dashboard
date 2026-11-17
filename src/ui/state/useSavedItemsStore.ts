import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPrUiOptionPersistenceHelpers,
  serializeOverridesUpdate,
} from '../helpers/pr-ui-option-persistence.helpers.ts';
import type { SavedItem } from '../helpers/saved-items.helpers.ts';

const { readUiSessionOverridesOrNull, writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

export interface SavedItemsStoreOptions<T extends SavedItem> {
  // The user defaults' key the list is saved under.
  key: string;
  // The list from the overrides.
  read: (overrides: Record<string, unknown>) => T[];
  // The overrides' value for the list.
  toValue: (items: readonly T[]) => unknown;
}

export interface SavedItemsStore<T extends SavedItem> {
  // Null until read from the user defaults, and while they can't be (one
  // saved then would be lost).
  items: T[] | null;
  // A change couldn't be saved (the items shown are back to as last
  // saved); cleared by the next change that is.
  saveFailed: boolean;
  add: (item: T) => void;
  rename: (id: string, name: string) => void;
  // Replaces the item's other fields with these.
  edit: (id: string, changes: Partial<Omit<T, 'id' | 'name'>>) => void;
  remove: (id: string) => void;
  // Puts a deleted item back where it was (Undo); not when it's there.
  restore: (item: T, index: number) => void;
}

/**
 * A named list kept in the user defaults (saved-items.helpers.ts): read
 * when mounted and again whenever the window regains focus (another
 * browser or tab may have changed it). Each change - add, rename, edit,
 * delete, restore - shows at once, and is saved by applying it to the list
 * as saved then (read again, one at a time with the other saves of the
 * user defaults), so it doesn't write back this page's older copy over a
 * change made elsewhere; an item changed that was deleted elsewhere stays
 * deleted. One that can't be saved goes back to the list as last saved,
 * and says so (saveFailed). The re-reads wait for those saves too, so one
 * doesn't show the list from before a save still being made.
 */
export function useSavedItemsStore<T extends SavedItem>({ key, read, toValue }: SavedItemsStoreOptions<T>): SavedItemsStore<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // The list as last read or saved: what a change that can't be saved goes
  // back to.
  const savedItemsRef = useRef<T[] | null>(null);
  // The latest options, so the callbacks below needn't change with them.
  const optionsRef = useRef({ key, read, toValue });
  optionsRef.current = { key, read, toValue };

  useEffect(() => {
    let cancelled = false;
    // A read that fails keeps what's shown: nothing on the first, else the
    // list as last read.
    const load = () =>
      serializeOverridesUpdate(async () => {
        const overrides = await readUiSessionOverridesOrNull();
        if (cancelled || !overrides) return;
        savedItemsRef.current = optionsRef.current.read(overrides);
        setItems(savedItemsRef.current);
      });
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const change = useCallback((transform: (list: T[]) => T[]) => {
    setItems((previous) => (previous ? transform(previous) : previous));
    void serializeOverridesUpdate(async () => {
      const options = optionsRef.current;
      const existing = await readUiSessionOverridesOrNull();
      const next = existing ? transform(options.read(existing)) : null;
      const saved =
        existing && next
          ? await writeUiSessionOverrides({ ...existing, [options.key]: options.toValue(next) }, { unchangedFrom: existing })
          : false;
      if (saved && next) savedItemsRef.current = next;
      setSaveFailed(!saved);
      setItems(savedItemsRef.current);
    });
  }, []);

  const add = useCallback((item: T) => change((list) => [...list, item]), [change]);
  const rename = useCallback(
    (id: string, name: string) => change((list) => list.map((item) => (item.id === id ? { ...item, name: name.trim() } : item))),
    [change],
  );
  const edit = useCallback(
    (id: string, changes: Partial<Omit<T, 'id' | 'name'>>) =>
      change((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [change],
  );
  const remove = useCallback((id: string) => change((list) => list.filter((item) => item.id !== id)), [change]);
  const restore = useCallback(
    (item: T, index: number) =>
      change((list) => (list.some((each) => each.id === item.id) ? list : [...list.slice(0, index), item, ...list.slice(index)])),
    [change],
  );

  return { items, saveFailed, add, rename, edit, remove, restore };
}
