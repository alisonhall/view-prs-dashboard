/** @jest-environment jsdom */

import {
  CUSTOM_SECTIONS_MAX,
  CUSTOM_SECTIONS_STORAGE_KEY,
  customSectionIdsFor,
  customSectionKey,
  newCustomSectionId,
  normalizeCustomSectionName,
  normalizeCustomSections,
  readStoredCustomSections,
  storeCustomSections,
} from './pr-custom-sections.helpers';

describe('custom sections', () => {
  test('normalize keeps sections with a valid id (once) and a name, and replaces an unknown icon or colour', () => {
    expect(
      normalizeCustomSections([
        { id: 'abc', name: '  Release   blockers ', icon: 'flag', tone: 'danger' },
        { id: 'abc', name: 'Again' },
        { id: 'Bad-Id', name: 'Bad id' },
        { id: 'noname', name: '   ' },
        { id: 'xyz', name: 'Later', icon: 'rocket', tone: 'pink' },
        null,
        'flagged',
      ]),
    ).toEqual([
      { id: 'abc', name: 'Release blockers', icon: 'flag', tone: 'danger' },
      { id: 'xyz', name: 'Later', icon: 'tag', tone: 'accent' },
    ]);
    expect(normalizeCustomSections({ id: 'abc', name: 'x' })).toEqual([]);
  });

  test('normalize keeps no more than the most there can be, and names no longer than the limit', () => {
    const many = Array.from({ length: CUSTOM_SECTIONS_MAX + 3 }, (_, index) => ({ id: `s${index}`, name: `S${index}` }));
    expect(normalizeCustomSections(many)).toHaveLength(CUSTOM_SECTIONS_MAX);
    expect(normalizeCustomSectionName('x'.repeat(80))).toHaveLength(60);
  });

  test("a new id isn't one already used", () => {
    const values = [0.5, 0.5, 0.25];
    const random = () => values.shift() ?? 0.75;
    const first = newCustomSectionId([], () => 0.5);
    expect(first).toMatch(/^[a-z0-9]{8}$/);
    expect(newCustomSectionId([{ id: first, name: 'A', icon: 'tag', tone: 'accent' }], random)).not.toBe(first);
  });

  test("a section's key on the page, and the sections a PR is in", () => {
    expect(customSectionKey('abc')).toBe('custom-abc');
    const byRepo = { 'acme/app': { 7: ['abc', 'xyz'] } };
    expect(customSectionIdsFor(byRepo, 'acme/app', 7)).toEqual(['abc', 'xyz']);
    expect(customSectionIdsFor(byRepo, 'acme/app', '8')).toEqual([]);
    expect(customSectionIdsFor(undefined, 'acme/app', '7')).toEqual([]);
  });

  test('the browser copy reads back normalized, and a malformed one counts as none', () => {
    window.localStorage.clear();
    expect(readStoredCustomSections()).toBeNull();
    storeCustomSections([{ id: 'abc', name: 'Mine', icon: 'eye', tone: 'done' }]);
    expect(readStoredCustomSections()).toEqual([{ id: 'abc', name: 'Mine', icon: 'eye', tone: 'done' }]);
    window.localStorage.setItem(CUSTOM_SECTIONS_STORAGE_KEY, '{nope');
    expect(readStoredCustomSections()).toBeNull();
  });
});
