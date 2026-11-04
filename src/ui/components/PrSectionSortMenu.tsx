import { usePrSectionPreferences } from '../state/PrSectionPreferencesProvider';
import { prSectionSort } from '../helpers/pr-section-preferences.helpers.ts';
import {
  SECTION_SORT_FIELD_LABELS,
  sectionSortFields,
  type SectionSortDirection,
  type SectionSortField,
} from '../helpers/pr-section-sort.helpers.ts';
import { MenuButton } from './ui/MenuButton';

// What each direction reads as for the field: numbers go highest/lowest,
// dates newest/oldest.
const directionLabel = (by: SectionSortField, direction: SectionSortDirection) =>
  by === 'number'
    ? direction === 'desc'
      ? 'Highest first'
      : 'Lowest first'
    : direction === 'desc'
      ? 'Newest first'
      : 'Oldest first';

/**
 * A section's sort, as a small menu button in its table's header row: what
 * by (PR number, last updated, and the date merged or closed in those
 * sections) and which way, the current choices checked. Its name says the
 * current sort ("Sort Open PRs: PR number, highest first"). Saved with the
 * section's preferences (user-defaults.json's prSections) as soon as it's
 * chosen; the default (merged by date merged, closed by date closed, the
 * rest by PR number, newest first) isn't saved.
 */
export function PrSectionSortMenu({ sectionKey, sectionTitle }: { sectionKey: string; sectionTitle: string }) {
  const { preferences, setSectionSort } = usePrSectionPreferences();
  const sort = prSectionSort(preferences, sectionKey);

  return (
    <MenuButton
      icon="sort"
      label={`Sort ${sectionTitle}: ${SECTION_SORT_FIELD_LABELS[sort.by]}, ${directionLabel(sort.by, sort.direction).toLowerCase()}`}
      entries={[
        {
          id: 'by',
          label: 'Sort by',
          items: sectionSortFields(sectionKey).map((field) => ({
            id: `by-${field}`,
            label: SECTION_SORT_FIELD_LABELS[field],
            checked: field === sort.by,
            onSelect: () => setSectionSort(sectionKey, { by: field, direction: sort.direction }),
          })),
        },
        {
          id: 'direction',
          label: 'Order',
          items: (['desc', 'asc'] as const).map((direction) => ({
            id: `direction-${direction}`,
            label: directionLabel(sort.by, direction),
            checked: direction === sort.direction,
            onSelect: () => setSectionSort(sectionKey, { by: sort.by, direction }),
          })),
        },
      ]}
    />
  );
}
