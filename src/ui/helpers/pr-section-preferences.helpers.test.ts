import { createPrSectionConfigHelpers } from './pr-section-config.helpers';
import { createPrSmartGroupsHelpers } from './pr-smart-groups.helpers';
import {
  isPrSectionHidden,
  normalizePrSectionPreferences,
  PR_SECTION_CATALOG,
  prSectionStartsOpen,
  withPrSectionPreference,
} from './pr-section-preferences.helpers';

describe('PR section preferences', () => {
  test('the catalog lists the sections the table builds, in order, with their titles and open defaults', () => {
    const smartGroups = createPrSmartGroupsHelpers().applySmartGroups([], createPrSmartGroupsHelpers().buildSmartGroupConfigs());
    const built = createPrSectionConfigHelpers()
      .buildPrSectionConfigs({ grouped: { open: [], draft: [], closed: [], merged: [] }, smartGroups })
      .map(({ sectionKey, title, isOpen }) => ({ key: sectionKey, title, defaultOpen: isOpen }));
    expect(PR_SECTION_CATALOG).toEqual(built);
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
});
