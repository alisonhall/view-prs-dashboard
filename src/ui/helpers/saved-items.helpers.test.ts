import { getActiveAndModifiedIds, isNameFree, makeItemId, readSavedItems } from './saved-items.helpers.ts';

const ITEMS = [
  { id: 'a', name: 'Needs attention' },
  { id: 'b', name: 'Waiting on me' },
];

describe('readSavedItems', () => {
  test('null until the list was saved; an empty one is read as empty', () => {
    const parse = (_entry: Record<string, unknown>, base: { id: string; name: string }) => base;
    expect(readSavedItems(undefined, 'views', parse)).toBeNull();
    expect(readSavedItems({ views: 'x' }, 'views', parse)).toBeNull();
    expect(readSavedItems({ views: [] }, 'views', parse)).toEqual([]);
  });

  test('drops entries without a name, makes ids unique, and hands the rest to parse', () => {
    const items = readSavedItems(
      { profiles: [{ id: 'a', name: ' Mine ', extra: 1 }, { id: 'a', name: 'Copy' }, { name: 'No id' }, { name: '' }, 'junk'] },
      'profiles',
      (entry, base) => ({ ...base, extra: entry.extra ?? null }),
    );
    expect(items).toEqual([
      { id: 'a', name: 'Mine', extra: 1 },
      { id: 'a-1', name: 'Copy', extra: null },
      { id: 'item-2', name: 'No id', extra: null },
    ]);
  });
});

describe('isNameFree', () => {
  test("not another item's name (ignoring case), nor empty; an item's own name is free for it", () => {
    expect(isNameFree(ITEMS, 'waiting ON me')).toBe(false);
    expect(isNameFree(ITEMS, '  ')).toBe(false);
    expect(isNameFree(ITEMS, 'Mine')).toBe(true);
    expect(isNameFree(ITEMS, 'Waiting on me', 'b')).toBe(true);
  });
});

describe('getActiveAndModifiedIds', () => {
  const matching = (id: string) => (item: { id: string }) => item.id === id;
  test('the matching item is active; the applied one is modified only while none matches and something is chosen', () => {
    expect(getActiveAndModifiedIds(ITEMS, 'a', matching('a'), true)).toEqual({ activeId: 'a', modifiedId: '' });
    expect(getActiveAndModifiedIds(ITEMS, 'a', matching('b'), true)).toEqual({ activeId: 'b', modifiedId: '' });
    expect(getActiveAndModifiedIds(ITEMS, 'a', matching('none'), true)).toEqual({ activeId: '', modifiedId: 'a' });
    expect(getActiveAndModifiedIds(ITEMS, 'a', matching('none'), false)).toEqual({ activeId: '', modifiedId: '' });
    expect(getActiveAndModifiedIds(ITEMS, 'gone', matching('none'), true)).toEqual({ activeId: '', modifiedId: '' });
    expect(getActiveAndModifiedIds(null, 'a', matching('a'), true)).toEqual({ activeId: '', modifiedId: '' });
  });
});

test('makeItemId starts with the prefix, and two made at once differ', () => {
  expect(makeItemId('profile', 0)).toMatch(/^profile-0-/);
  expect(makeItemId('view', 1)).not.toBe(makeItemId('view', 1));
});
