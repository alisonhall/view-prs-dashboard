import { defaultSectionSort, isSectionSort, sectionSortFields, type SectionSort } from './pr-section-sort.helpers.ts';
import { customSectionKey, type CustomSection } from './pr-custom-sections.helpers.ts';

// Settings › Appearance's section choices: which PR table sections show,
// and which start open when the page loads - and each section's sort
// (chosen in the section itself; pr-section-sort.helpers.ts). Saved in user-defaults.json
// under PR_SECTIONS_OVERRIDE_KEY, keeping only what differs from the
// built-in defaults: { "flagged": { "open": true }, "closed": { "hidden": true } }.
// A browser copy (PR_SECTIONS_STORAGE_KEY) lets the table draw with them
// straight away, before user-defaults.json has been read.

// Smart groups (Flagged, In Review, Needs Attention...) hold PRs by rules
// or your own marks, alongside the status sections (Open, Draft, Closed,
// Merged) that every PR is in one of. The page lists them apart, each kind
// under its own heading.
export type PrSectionKind = 'smart' | 'status';

export interface PrSectionCatalogEntry {
  key: string;
  title: string;
  defaultOpen: boolean;
  kind: PrSectionKind;
}

// Every section, in the table's default order, with its built-in open
// state and kind - the same as buildSmartGroupConfigs
// (pr-smart-groups.helpers.ts) and the lifecycle sections in
// pr-section-config.helpers.ts (the test checks).
export const PR_SECTION_CATALOG: ReadonlyArray<PrSectionCatalogEntry> = [
  { key: 'flagged', title: 'Flagged', defaultOpen: false, kind: 'smart' },
  { key: 'in-review', title: 'In Review', defaultOpen: true, kind: 'smart' },
  { key: 'needs-attention', title: 'Needs Attention', defaultOpen: true, kind: 'smart' },
  { key: 'mine', title: 'My Open & Draft PRs', defaultOpen: true, kind: 'smart' },
  { key: 'assigned-to-me', title: 'Assigned to Me', defaultOpen: true, kind: 'smart' },
  { key: 'review-requested', title: 'Me as Reviewer', defaultOpen: true, kind: 'smart' },
  { key: 'interacted', title: "Open PRs I'm Involved In", defaultOpen: false, kind: 'smart' },
  { key: 'open', title: 'Open PRs', defaultOpen: false, kind: 'status' },
  { key: 'draft', title: 'Draft PRs', defaultOpen: false, kind: 'status' },
  { key: 'closed', title: 'Closed PRs', defaultOpen: false, kind: 'status' },
  { key: 'merged', title: 'Latest Merged PRs', defaultOpen: false, kind: 'status' },
];

export type PrSectionCatalog = ReadonlyArray<PrSectionCatalogEntry>;

// Every section with the custom ones (pr-custom-sections.helpers.ts): last
// among the smart groups, open on page load, titled by their names. The
// functions below take it, defaulting to the built-in sections.
export const prSectionCatalog = (customSections: ReadonlyArray<CustomSection> = []): PrSectionCatalog => {
  if (customSections.length === 0) return PR_SECTION_CATALOG;
  const custom = customSections.map((section): PrSectionCatalogEntry => ({
    key: customSectionKey(section.id),
    title: section.name,
    defaultOpen: true,
    kind: 'smart',
  }));
  return [
    ...PR_SECTION_CATALOG.filter((entry) => entry.kind === 'smart'),
    ...custom,
    ...PR_SECTION_CATALOG.filter((entry) => entry.kind === 'status'),
  ];
};

// Whether a section (other than the one with key `exceptKey`) is already
// called this, ignoring case and spaces: a custom section can't share a
// name, or its rows, menu items and settings couldn't be told apart.
export const isPrSectionTitleTaken = (title: string, catalog: PrSectionCatalog, exceptKey = '') => {
  const wanted = title.replace(/\s+/g, ' ').trim().toLowerCase();
  return catalog.some((entry) => entry.key !== exceptKey && entry.title.toLowerCase() === wanted);
};

export const PR_SECTIONS_OVERRIDE_KEY = 'prSections';
export const PR_SECTIONS_STORAGE_KEY = 'view-prs:pr-sections';

export interface PrSectionPreference {
  hidden?: true;
  open?: boolean;
  sort?: SectionSort;
}
export type PrSectionPreferences = Record<string, PrSectionPreference>;

// A section's built-in open state (true for a custom section).
export const prSectionDefaultOpen = (key: string, catalog: PrSectionCatalog = PR_SECTION_CATALOG) =>
  catalog.find((entry) => entry.key === key)?.defaultOpen ?? false;

// Keeps known sections only, booleans only, and only what differs from the
// defaults - so a saved file with stray or stale values still reads.
export const normalizePrSectionPreferences = (value: unknown, catalog: PrSectionCatalog = PR_SECTION_CATALOG): PrSectionPreferences => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: PrSectionPreferences = {};
  catalog.forEach(({ key, defaultOpen }) => {
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
export const readStoredPrSectionPreferences = (catalog: PrSectionCatalog = PR_SECTION_CATALOG): PrSectionPreferences | null => {
  try {
    const value = window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY);
    return value === null ? null : normalizePrSectionPreferences(JSON.parse(value), catalog);
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

// Settings › Appearance's section order: the section keys in the order
// the page lists them, the smart groups before the status sections - each
// kind is reordered among its own. Saved in user-defaults.json under
// PR_SECTION_ORDER_OVERRIDE_KEY only when it differs from the catalog's,
// with a browser copy for the first draw like the other choices.
export const PR_SECTION_ORDER_OVERRIDE_KEY = 'prSectionOrder';
export const PR_SECTION_ORDER_STORAGE_KEY = 'view-prs:pr-section-order';
export const DEFAULT_PR_SECTION_ORDER: ReadonlyArray<string> = PR_SECTION_CATALOG.map((entry) => entry.key);

export const prSectionKind = (key: string, catalog: PrSectionCatalog = PR_SECTION_CATALOG): PrSectionKind | undefined =>
  catalog.find((entry) => entry.key === key)?.kind;

// Known keys once each, in the saved order; a section missing from it (one
// added since it was saved) goes last among its kind; then the smart
// groups, then the status sections.
export const normalizePrSectionOrder = (value: unknown, catalog: PrSectionCatalog = PR_SECTION_CATALOG): string[] => {
  const defaults = catalog.map((entry) => entry.key);
  const known = new Set(defaults);
  const saved = Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && known.has(key)))] : [];
  const full = [...saved, ...defaults.filter((key) => !saved.includes(key))];
  return [
    ...full.filter((key) => prSectionKind(key, catalog) === 'smart'),
    ...full.filter((key) => prSectionKind(key, catalog) === 'status'),
  ];
};

export const isDefaultPrSectionOrder = (order: ReadonlyArray<string>, catalog: PrSectionCatalog = PR_SECTION_CATALOG) =>
  order.length === catalog.length && order.every((key, index) => key === catalog[index]?.key);

// The order with a section moved one place up (-1) or down (1) among its
// own kind; unchanged at the end of its kind.
export const movePrSection = (
  order: ReadonlyArray<string>,
  key: string,
  offset: -1 | 1,
  catalog: PrSectionCatalog = PR_SECTION_CATALOG,
): string[] => {
  const next = normalizePrSectionOrder(order, catalog);
  const index = next.indexOf(key);
  const neighbour = next[index + offset];
  if (index < 0 || neighbour === undefined || prSectionKind(neighbour, catalog) !== prSectionKind(key, catalog)) return next;
  next[index + offset] = key;
  next[index] = neighbour;
  return next;
};

// Sections in the saved order; any it doesn't know keep their place after.
export const orderPrSections = <T extends { key: string }>(sections: ReadonlyArray<T>, order: ReadonlyArray<string>): T[] => {
  const position = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => position(a.section.key) - position(b.section.key) || a.index - b.index)
    .map(({ section }) => section);
};

export const readStoredPrSectionOrder = (catalog: PrSectionCatalog = PR_SECTION_CATALOG): string[] | null => {
  try {
    const value = window.localStorage.getItem(PR_SECTION_ORDER_STORAGE_KEY);
    return value === null ? null : normalizePrSectionOrder(JSON.parse(value), catalog);
  } catch (_error) {
    return null;
  }
};

export const storePrSectionOrder = (order: ReadonlyArray<string>) => {
  try {
    window.localStorage.setItem(PR_SECTION_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch (_error) {
    // Only the first draw uses the copy; user-defaults.json keeps the order.
  }
};

export const isPrSectionHidden = (preferences: PrSectionPreferences, key: string) => preferences[key]?.hidden === true;

// Whether a section starts open: the saved choice, else the built-in default.
export const prSectionStartsOpen = (preferences: PrSectionPreferences, key: string, fallback = prSectionDefaultOpen(key)) =>
  preferences[key]?.open ?? fallback;

export const withPrSectionPreference = (
  preferences: PrSectionPreferences,
  key: string,
  change: { hidden?: boolean; open?: boolean; sort?: SectionSort },
  catalog: PrSectionCatalog = PR_SECTION_CATALOG,
): PrSectionPreferences => {
  const current = preferences[key] || {};
  return normalizePrSectionPreferences(
    {
      ...preferences,
      [key]: {
        hidden: change.hidden ?? current.hidden,
        open: change.open ?? current.open,
        sort: change.sort ?? current.sort,
      },
    },
    catalog,
  );
};

// How a section sorts: the saved choice, else its default.
export const prSectionSort = (preferences: PrSectionPreferences, key: string): SectionSort =>
  preferences[key]?.sort ?? defaultSectionSort(key);
