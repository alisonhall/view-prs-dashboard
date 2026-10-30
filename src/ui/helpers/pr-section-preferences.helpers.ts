// Settings › Appearance's section choices: which PR table sections show,
// and which start open when the page loads. Saved in user-defaults.json
// under PR_SECTIONS_OVERRIDE_KEY, keeping only what differs from the
// built-in defaults: { "flagged": { "open": true }, "closed": { "hidden": true } }.

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

export interface PrSectionPreference {
  hidden?: true;
  open?: boolean;
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
    const { hidden, open } = saved as { hidden?: unknown; open?: unknown };
    const preference: PrSectionPreference = {};
    if (hidden === true) preference.hidden = true;
    if (typeof open === 'boolean' && open !== defaultOpen) preference.open = open;
    if (Object.keys(preference).length > 0) result[key] = preference;
  });
  return result;
};

export const isPrSectionHidden = (preferences: PrSectionPreferences, key: string) => preferences[key]?.hidden === true;

// Whether a section starts open: the saved choice, else the built-in default.
export const prSectionStartsOpen = (preferences: PrSectionPreferences, key: string, fallback = builtInOpen(key)) =>
  preferences[key]?.open ?? fallback;

export const withPrSectionPreference = (
  preferences: PrSectionPreferences,
  key: string,
  change: { hidden?: boolean; open?: boolean },
): PrSectionPreferences => {
  const current = preferences[key] || {};
  return normalizePrSectionPreferences({
    ...preferences,
    [key]: {
      hidden: change.hidden ?? current.hidden,
      open: change.open ?? current.open,
    },
  });
};
