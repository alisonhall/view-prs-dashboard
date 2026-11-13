import { createPrSectionConfigHelpers } from './pr-section-config.helpers';
import { createPrSmartGroupsHelpers } from './pr-smart-groups.helpers';
import {
  DEFAULT_PR_SECTION_ORDER,
  isDefaultPrSectionOrder,
  isPrSectionHidden,
  movePrSection,
  normalizePrSectionOrder,
  orderPrSections,
  isPrSectionTitleTaken,
  prSectionCatalog,
  prSectionDefaultOpen,
  prSectionKind,
  normalizePrSectionPreferences,
  PR_SECTION_CATALOG,
  prSectionSort,
  prSectionStartsOpen,
  withPrSectionPreference,
} from './pr-section-preferences.helpers';

describe('PR section preferences', () => {
  test('the catalog lists the sections the table builds, in order, with their titles, open defaults and kinds', () => {
    const smartGroups = createPrSmartGroupsHelpers().applySmartGroups([], createPrSmartGroupsHelpers().buildSmartGroupConfigs());
    const built = createPrSectionConfigHelpers()
      .buildPrSectionConfigs({ grouped: { open: [], draft: [], closed: [], merged: [] }, smartGroups })
      .map(({ sectionKey, title, isOpen, isSmartGroup }) => ({ key: sectionKey, title, defaultOpen: isOpen, kind: isSmartGroup ? 'smart' : 'status' }));
    expect(PR_SECTION_CATALOG).toEqual(built);
  });

  describe('section order', () => {
    const smart = ['flagged', 'in-review', 'needs-attention', 'mine', 'assigned-to-me', 'review-requested', 'interacted'];
    const status = ['open', 'draft', 'closed', 'merged'];

    test('the default is the catalog order, smart groups first', () => {
      expect(DEFAULT_PR_SECTION_ORDER).toEqual([...smart, ...status]);
      expect(normalizePrSectionOrder(undefined)).toEqual([...smart, ...status]);
      expect(isDefaultPrSectionOrder(normalizePrSectionOrder(null))).toBe(true);
    });

    test('normalize keeps known keys once, adds missing ones last among their kind, and keeps the smart groups first', () => {
      expect(normalizePrSectionOrder(['merged', 'gone', 'interacted', 7, 'merged', 'flagged'])).toEqual([
        'interacted',
        'flagged',
        'in-review',
        'needs-attention',
        'mine',
        'assigned-to-me',
        'review-requested',
        'merged',
        'open',
        'draft',
        'closed',
      ]);
      expect(normalizePrSectionOrder('flagged')).toEqual(DEFAULT_PR_SECTION_ORDER);
    });

    test('a move swaps a section with its neighbour of the same kind, and stops at the ends of its kind', () => {
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'in-review', -1).slice(0, 2)).toEqual(['in-review', 'flagged']);
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'merged', -1).slice(-2)).toEqual(['merged', 'closed']);
      // Not across into the other kind, nor past either end.
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'interacted', 1)).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'open', -1)).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'flagged', -1)).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'merged', 1)).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(movePrSection(DEFAULT_PR_SECTION_ORDER, 'unknown', 1)).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(isDefaultPrSectionOrder(movePrSection(DEFAULT_PR_SECTION_ORDER, 'draft', 1))).toBe(false);
    });

    test("custom sections join the catalog last among the smart groups, open on page load, and are ordered and chosen for like the others", () => {
      const catalog = prSectionCatalog([{ id: "abc", name: "Release blockers", icon: "flag", tone: "danger" }]);
      expect(catalog.map((entry) => entry.key)).toEqual([...smart, "custom-abc", ...status]);
      expect(catalog.find((entry) => entry.key === "custom-abc")).toEqual({ key: "custom-abc", title: "Release blockers", defaultOpen: true, kind: "smart" });
      expect(prSectionCatalog([])).toBe(PR_SECTION_CATALOG);
      expect(prSectionKind("custom-abc", catalog)).toBe("smart");
      expect(prSectionDefaultOpen("custom-abc", catalog)).toBe(true);

      // Its key is kept with it, and dropped without it.
      expect(normalizePrSectionOrder(["custom-abc", "flagged"], catalog).slice(0, 2)).toEqual(["custom-abc", "flagged"]);
      expect(normalizePrSectionOrder(["custom-abc", "flagged"])).toEqual(DEFAULT_PR_SECTION_ORDER);
      expect(isDefaultPrSectionOrder(catalog.map((entry) => entry.key), catalog)).toBe(true);
      expect(movePrSection(catalog.map((entry) => entry.key), "custom-abc", -1, catalog).slice(6, 8)).toEqual(["custom-abc", "interacted"]);
      expect(movePrSection(catalog.map((entry) => entry.key), "custom-abc", 1, catalog)).toEqual(catalog.map((entry) => entry.key));
      expect(normalizePrSectionPreferences({ "custom-abc": { hidden: true, open: true } }, catalog)).toEqual({ "custom-abc": { hidden: true } });
      expect(normalizePrSectionPreferences({ "custom-abc": { hidden: true } })).toEqual({});
      expect(withPrSectionPreference({}, "custom-abc", { open: false }, catalog)).toEqual({ "custom-abc": { open: false } });
    });

    test("a title is taken when any other section has it, ignoring case and spaces", () => {
      const catalog = prSectionCatalog([{ id: "abc", name: "Release blockers", icon: "flag", tone: "danger" }]);
      expect(isPrSectionTitleTaken("  open   prs ", catalog)).toBe(true);
      expect(isPrSectionTitleTaken("RELEASE BLOCKERS", catalog)).toBe(true);
      expect(isPrSectionTitleTaken("Release blockers", catalog, "custom-abc")).toBe(false);
      expect(isPrSectionTitleTaken("Soon", catalog)).toBe(false);
    });

    test('sections follow the order, and any it lacks keep their place after', () => {
      const sections = ['open', 'extra', 'flagged', 'merged'].map((key) => ({ key }));
      expect(orderPrSections(sections, ['merged', 'flagged', 'open']).map((section) => section.key)).toEqual(['merged', 'flagged', 'open', 'extra']);
      expect(orderPrSections(sections, []).map((section) => section.key)).toEqual(['open', 'extra', 'flagged', 'merged']);
    });
  });

  test('normalize keeps known sections and booleans, and drops what matches the defaults', () => {
    expect(
      normalizePrSectionPreferences({
        flagged: { open: true, hidden: false },
        'in-review': { open: true },
        closed: { hidden: true },
        open: { hidden: 'yes', open: 'no' },
        gone: { hidden: true },
      }),
    ).toEqual({ flagged: { open: true }, closed: { hidden: true } });
    expect(normalizePrSectionPreferences(null)).toEqual({});
    expect(normalizePrSectionPreferences(['flagged'])).toEqual({});
  });

  test('a section starts open from the saved choice, else its default', () => {
    expect(prSectionStartsOpen({}, 'in-review')).toBe(true);
    expect(prSectionStartsOpen({ 'in-review': { open: false } }, 'in-review')).toBe(false);
    expect(prSectionStartsOpen({}, 'unknown', true)).toBe(true);
  });

  test('withPrSectionPreference changes one choice and keeps the others', () => {
    const hidden = withPrSectionPreference({}, 'closed', { hidden: true });
    expect(isPrSectionHidden(hidden, 'closed')).toBe(true);

    const openToo = withPrSectionPreference(hidden, 'closed', { open: true });
    expect(openToo).toEqual({ closed: { hidden: true, open: true } });

    // Back to the defaults: nothing left to save.
    const shown = withPrSectionPreference(openToo, 'closed', { hidden: false });
    expect(withPrSectionPreference(shown, 'closed', { open: false })).toEqual({});
  });

  test("keeps a section's sort when it's one the section offers and not its default", () => {
    expect(
      normalizePrSectionPreferences({
        merged: { sort: { by: 'number', direction: 'asc' } },
        open: { sort: { by: 'number', direction: 'desc' } },
        flagged: { sort: { by: 'merged', direction: 'desc' } },
        draft: { sort: { by: 'sideways', direction: 'desc' } },
      }),
    ).toEqual({ merged: { sort: { by: 'number', direction: 'asc' } } });
  });

  test("a section sorts by the saved choice, else its default, and choosing the default saves nothing", () => {
    const sorted = withPrSectionPreference({ closed: { hidden: true } }, 'open', { sort: { by: 'updated', direction: 'asc' } });
    expect(prSectionSort(sorted, 'open')).toEqual({ by: 'updated', direction: 'asc' });
    expect(prSectionSort(sorted, 'merged')).toEqual({ by: 'merged', direction: 'desc' });
    expect(sorted.closed).toEqual({ hidden: true });

    expect(withPrSectionPreference(sorted, 'open', { sort: { by: 'number', direction: 'desc' } })).toEqual({ closed: { hidden: true } });
  });
});
