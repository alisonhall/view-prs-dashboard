// Named lists kept in user-defaults.json (the UI option overrides): the
// filter bar's saved views (saved-filter-views.helpers.ts) and Export's
// field profiles (export-field-profiles.helpers.ts). Each is saved under
// its own key as `{ [listKey]: [...] }` - an object, not an array: the
// overrides writer drops empty arrays, which would make "every one
// deleted" read as "none ever saved".

export interface SavedItem {
  id: string;
  name: string;
}

// The entries saved under `{ [listKey]: [...] }`, each read by `parse`
// from its id and name; null when that list was never saved. Entries
// without a name are dropped; an id is made for one without (a hand edit),
// and a repeated one made unique.
export const readSavedItems = <T extends SavedItem>(
  saved: unknown,
  listKey: string,
  parse: (entry: Record<string, unknown>, base: SavedItem) => T,
): T[] | null => {
  const entries = saved && typeof saved === "object" ? (saved as Record<string, unknown>)[listKey] : undefined;
  if (!Array.isArray(entries)) return null;
  const seen = new Set<string>();
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    if (!name) return [];
    let id = String(record.id ?? "").trim() || `item-${index}`;
    while (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    return [parse(record, { id, name })];
  });
};

// Whether no other item has this name (ignoring case); false for an empty
// one.
export const isNameFree = (items: readonly SavedItem[], name: string, exceptId = ""): boolean => {
  const wanted = name.trim().toLowerCase();
  return Boolean(wanted) && !items.some((item) => item.id !== exceptId && item.name.trim().toLowerCase() === wanted);
};

// Which item is shown as applied now: `activeId`, the first whose content
// `matches` what's chosen; and `modifiedId`, the one last applied or saved
// (`appliedId`) while something else is chosen and no item has it - not
// when nothing is chosen (`hasChoice`). "" for none.
export const getActiveAndModifiedIds = <T extends SavedItem>(
  items: readonly T[] | null,
  appliedId: string,
  matches: (item: T) => boolean,
  hasChoice: boolean,
): { activeId: string; modifiedId: string } => {
  const activeId = items?.find(matches)?.id || "";
  const modifiedId = appliedId && !activeId && hasChoice && items?.some((item) => item.id === appliedId) ? appliedId : "";
  return { activeId, modifiedId };
};

export const makeItemId =(prefix: string, nowMs: number = Date.now()): string =>
  `${prefix}-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
