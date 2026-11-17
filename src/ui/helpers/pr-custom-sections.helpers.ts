import type { IconName } from '../components/ui/Icon';
import type { PrDataPayload } from '../types/pr-data.ts';

// Custom sections: smart groups you make in Settings › Appearance, each
// with a name, an icon and a colour, holding the PRs you add to them by
// hand (each row's More actions), like Flagged. Their definitions are
// saved in user-defaults.json under CUSTOM_SECTIONS_OVERRIDE_KEY, and which
// PRs are in each in the user state's customSectionsByRepo (repo -> PR
// number -> section ids), shared by every browser like the flags.

export interface CustomSection {
  id: string;
  name: string;
  icon: IconName;
  tone: CustomSectionTone;
}

export type CustomSectionTone = 'accent' | 'success' | 'attention' | 'danger' | 'done' | 'muted';

// The colours to choose from: the page's own, each with its light and
// dark version (tokens.css), so text stays readable in both themes.
export const CUSTOM_SECTION_TONES: ReadonlyArray<{ tone: CustomSectionTone; label: string }> = [
  { tone: 'accent', label: 'Blue' },
  { tone: 'success', label: 'Green' },
  { tone: 'attention', label: 'Orange' },
  { tone: 'danger', label: 'Red' },
  { tone: 'done', label: 'Purple' },
  { tone: 'muted', label: 'Grey' },
];

// The icons to choose from, from the page's own set.
export const CUSTOM_SECTION_ICONS: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'tag', label: 'Tag' },
  { icon: 'flag', label: 'Flag' },
  { icon: 'eye', label: 'Eye' },
  { icon: 'note', label: 'Note' },
  { icon: 'chat', label: 'Speech bubble' },
  { icon: 'pulse', label: 'Pulse' },
  { icon: 'wrench', label: 'Wrench' },
  { icon: 'user', label: 'Person' },
  { icon: 'users', label: 'People' },
  { icon: 'alert', label: 'Warning' },
  { icon: 'check', label: 'Tick' },
  { icon: 'commit', label: 'Commit' },
];

export const CUSTOM_SECTIONS_OVERRIDE_KEY = 'customSections';
export const CUSTOM_SECTIONS_STORAGE_KEY = 'view-prs:custom-sections';
export const CUSTOM_SECTION_NAME_MAX_LENGTH = 60;
export const CUSTOM_SECTIONS_MAX = 20;

const DEFAULT_ICON: IconName = 'tag';
const DEFAULT_TONE: CustomSectionTone = 'accent';
const ID_PATTERN = /^[a-z0-9]{1,32}$/;

// The section's key on the page (data-pr-section, the choices saved per
// section): a prefix the built-in sections' keys don't have, and no
// colon, which the rows' per-section keys use as a separator.
export const customSectionKey = (id: string) => `custom-${id}`;

const isIcon = (value: unknown): value is IconName => CUSTOM_SECTION_ICONS.some((option) => option.icon === value);
const isTone = (value: unknown): value is CustomSectionTone => CUSTOM_SECTION_TONES.some((option) => option.tone === value);

export const normalizeCustomSectionName = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CUSTOM_SECTION_NAME_MAX_LENGTH);

// Sections with a valid id (once each) and a name, an unknown icon or
// colour replaced by the default, and no more than CUSTOM_SECTIONS_MAX - so
// a saved file with stray values still reads.
export const normalizeCustomSections = (value: unknown): CustomSection[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CustomSection[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object' || result.length >= CUSTOM_SECTIONS_MAX) return;
    const { id, name, icon, tone } = item as Record<string, unknown>;
    const cleanId = String(id ?? '');
    const cleanName = normalizeCustomSectionName(name);
    if (!ID_PATTERN.test(cleanId) || seen.has(cleanId) || !cleanName) return;
    seen.add(cleanId);
    result.push({ id: cleanId, name: cleanName, icon: isIcon(icon) ? icon : DEFAULT_ICON, tone: isTone(tone) ? tone : DEFAULT_TONE });
  });
  return result;
};

// A new id, not one of the sections' already.
export const newCustomSectionId = (sections: ReadonlyArray<CustomSection>, random: () => number = Math.random): string => {
  for (;;) {
    const id = Math.floor(random() * 36 ** 8)
      .toString(36)
      .padStart(8, '0');
    if (!sections.some((section) => section.id === id)) return id;
  }
};

// The ids of the custom sections a PR is in.
export const customSectionIdsFor = (
  customSectionsByRepo: PrDataPayload['customSectionsByRepo'] | null | undefined,
  repo: unknown,
  prNumber: unknown,
): string[] => customSectionsByRepo?.[String(repo || '')]?.[String(prNumber ?? '')] || [];

export const readStoredCustomSections = (): CustomSection[] | null => {
  try {
    const value = window.localStorage.getItem(CUSTOM_SECTIONS_STORAGE_KEY);
    return value === null ? null : normalizeCustomSections(JSON.parse(value));
  } catch (_error) {
    return null;
  }
};

export const storeCustomSections = (sections: ReadonlyArray<CustomSection>) => {
  try {
    window.localStorage.setItem(CUSTOM_SECTIONS_STORAGE_KEY, JSON.stringify(sections));
  } catch (_error) {
    // Only the first draw uses the copy; user-defaults.json keeps them.
  }
};
