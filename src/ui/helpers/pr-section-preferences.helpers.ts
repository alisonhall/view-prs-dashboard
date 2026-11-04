import { defaultSectionSort, isSectionSort, sectionSortFields, type SectionSort } from './pr-section-sort.helpers.ts';

// Settings › Appearance's section choices: which PR table sections show,
// and which start open when the page loads - and each section's sort
// (chosen in the section itself; pr-section-sort.helpers.ts). Saved in user-defaults.json
// under PR_SECTIONS_OVERRIDE_KEY, keeping only what differs from the
// built-in defaults: { "flagged": { "open": true }, "closed": { "hidden": true } }.
// A browser copy (PR_SECTIONS_STORAGE_KEY) lets the table draw with them
// straight away, before user-defaults.json has been read.

export interface PrSectionCatalogEntry {
  key: string;
  title: string;
  defaultOpen: boolean;
}

// Every section, in the table's order, with its built-in open state - the
// same as buildSmartGroupConfigs (pr-smart-groups.helpers.ts) and the
// lifecycle sections in pr-section-config.helpers.ts (the test checks).
export const PR_SECTION_CATALOG: ReadonlyArray<PrSectionCatalogEntry> = [
  { key: 'flagged', title: 'Flagged', defaultOpen: false },
  { key: 'in-review', title: 'In Review', defaultOpen: true },
  { key: 'needs-attention', title: 'Needs Attention', defaultOpen: true },
  { key: 'mine', title: 'My Open & Draft PRs', defaultOpen: true },
  { key: 'assigned-to-me', title: 'Assigned to Me', defaultOpen: true },
  { key: 'review-requested', title: 'Me as Reviewer', defaultOpen: true },
  { key: 'interacted', title: "Open PRs I'm Involved In", defaultOpen: false },
  { key: 'open', title: 'Open PRs', defaultOpen: false },
  { key: 'draft', title: 'Draft PRs', defaultOpen: false },
  { key: 'closed', title: 'Closed PRs', defaultOpen: false },
  { key: 'merged', title: 'Latest Merged PRs', defaultOpen: false },
];

export const PR_SECTIONS_OVERRIDE_KEY = 'prSections';
export const PR_SECTIONS_STORAGE_KEY = 'view-prs:pr-sections';

export interface PrSectionPreference {
  hidden?: true;
  open?: boolean;
  sort?: SectionSort;
}
export type PrSectionPreferences = Record<string, PrSectionPreference>;

const builtInOpen = (key: string) => PR_SECTION_CATALOG.find((entry) => entry.key === key)?.defaultOpen ?? false;

// Keeps known sections only, booleans only, and only what differs from the
// defaults - so a saved file with stray or stale values still reads.
export const normalizePrSectionPreferences = (value: unknown): PrSectionPreferences => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: PrSectionPreferences = {};
  PR_SECTION_CATALOG.forEach(({ key, defaultOpen }) => {
    const saved = (value as Record<string, unknown>)[key];
    if (!saved || typeof saved !== 'object') return;
    const { hidden, open, sort } = saved as { hidden?: unknown; open?: unknown; sort?: unknown };
    const preference: PrSectionPreference = {};
    if (hidden === true) preference.hidden = true;
    if (typeof open === 'boolean' && open !== defaultOpen) preference.open = open;
    // A sort the section offers, and not its default.
    if (isSectionSort(sort) && sectionSortFields(key).includes(sort.by)) {
      const fallback = defaultSectionSort(key);
      if (sort.by !== fallback.by || sort.direction !== fallback.direction) {
        preference.sort = { by: sort.by, direction: sort.direction };
      }
    }
    if (Object.keys(preference).length > 0) result[key] = preference;
  });
  return result;
};

// Storage can throw (blocked site data) or be missing, and the copy can be
// malformed; then there's no copy.
export const readStoredPrSectionPreferences = (): PrSectionPreferences | null => {
  try {
    const value = window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY);
    return value === null ? null : normalizePrSectionPreferences(JSON.parse(value));
  } catch (_error) {
    return null;
  }
};

export const storePrSectionPreferences = (preferences: PrSectionPreferences) => {
  try {
    window.localStorage.setItem(PR_SECTIONS_STORAGE_KEY, JSON.stringify(preferences));
  } catch (_error) {
    // Only the first draw uses the copy; user-defaults.json keeps the choices.
  }
};

// Settings › Appearance's "Group rows by repo": each section's rows under a
// heading per repo (PrTable). Saved like the section choices, in its own
// key.
export const PR_ROWS_GROUP_BY_REPO_OVERRIDE_KEY = 'prRowsGroupByRepo';
export const PR_ROWS_GROUP_BY_REPO_STORAGE_KEY = 'view-prs:pr-rows-group-by-repo';

export const readStoredGroupRowsByRepo = (): boolean | null => {
  try {
    const value = window.localStorage.getItem(PR_ROWS_GROUP_BY_REPO_STORAGE_KEY);
    return value === null ? null : value === 'true';
  } catch (_error) {
    return null;
  }
};

export const storeGroupRowsByRepo = (groupByRepo: boolean) => {
  try {
    window.localStorage.setItem(PR_ROWS_GROUP_BY_REPO_STORAGE_KEY, String(groupByRepo));
  } catch (_error) {
    // Only the first draw uses the copy; user-defaults.json keeps the choice.
  }
};

export const isPrSectionHidden =(preferences: PrSectionPreferences, key: string) => preferences[key]?.hidden === true;

// Whether a section starts open: the saved choice, else the built-in default.
export const prSectionStartsOpen = (preferences: PrSectionPreferences, key: string, fallback = builtInOpen(key)) =>
  preferences[key]?.open ?? fallback;

export const withPrSectionPreference = (
  preferences: PrSectionPreferences,
  key: string,
  change: { hidden?: boolean; open?: boolean; sort?: SectionSort },
): PrSectionPreferences => {
  const current = preferences[key] || {};
  return normalizePrSectionPreferences({
    ...preferences,
    [key]: {
      hidden: change.hidden ?? current.hidden,
      open: change.open ?? current.open,
      sort: change.sort ?? current.sort,
    },
  });
};

// How a section sorts: the saved choice, else its default.
export const prSectionSort = (preferences: PrSectionPreferences, key: string): SectionSort =>
  preferences[key]?.sort ?? defaultSectionSort(key);
