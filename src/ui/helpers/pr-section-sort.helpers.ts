import type { PrEntry } from '../types/pr-data.ts';
import { parseSortableTime } from './pr-sortable-time.helpers.ts';

// How a PR table section orders its rows: what by, and which way. Each
// section has a default (merged PRs by when they merged, closed ones by
// when they closed, every other section by PR number - newest first), and
// a choice saved with the section's other preferences
// (pr-section-preferences.helpers.ts).
export type SectionSortField = 'number' | 'updated' | 'merged' | 'closed';
export type SectionSortDirection = 'desc' | 'asc';

export interface SectionSort {
  by: SectionSortField;
  direction: SectionSortDirection;
}

export const SECTION_SORT_FIELD_LABELS: Record<SectionSortField, string> = {
  number: 'PR number',
  updated: 'Last updated',
  merged: 'Date merged',
  closed: 'Date closed',
};

export const defaultSectionSort = (sectionKey: string): SectionSort => {
  if (sectionKey === 'merged') return { by: 'merged', direction: 'desc' };
  if (sectionKey === 'closed') return { by: 'closed', direction: 'desc' };
  return { by: 'number', direction: 'desc' };
};

// What a section can sort by: a date only where its every PR has one.
export const sectionSortFields = (sectionKey: string): SectionSortField[] => [
  'number',
  'updated',
  ...(sectionKey === 'merged' ? (['merged'] as const) : []),
  ...(sectionKey === 'closed' ? (['closed'] as const) : []),
];

export const isSectionSort = (value: unknown): value is SectionSort =>
  Boolean(value) &&
  typeof value === 'object' &&
  ['number', 'updated', 'merged', 'closed'].includes(String((value as SectionSort).by)) &&
  ['desc', 'asc'].includes(String((value as SectionSort).direction));

const prNumberOf = (entry: PrEntry) => Number(entry?.data?.number ?? entry?.prNumber ?? 0) || 0;

const DATE_FIELDS: Record<Exclude<SectionSortField, 'number'>, 'sourceUpdatedAt' | 'mergedAt' | 'closedAt'> = {
  updated: 'sourceUpdatedAt',
  merged: 'mergedAt',
  closed: 'closedAt',
};

// A sorted copy (the section's rows are shared). Rows without the date go
// last whichever way; ties go to the higher PR number.
export const sortSectionRows = <E extends PrEntry>(rows: E[], { by, direction }: SectionSort): E[] => {
  const sign = direction === 'asc' ? 1 : -1;
  const valueOf = (entry: E): number | null => {
    if (by === 'number') return prNumberOf(entry);
    const time = parseSortableTime(entry?.data?.[DATE_FIELDS[by]]);
    return Number.isFinite(time) && time > 0 ? time : null;
  };
  return [...rows].sort((a, b) => {
    const valueA = valueOf(a);
    const valueB = valueOf(b);
    if (valueA === null || valueB === null) {
      if (valueA !== valueB) return valueA === null ? 1 : -1;
    } else if (valueA !== valueB) {
      return sign * (valueA - valueB);
    }
    return prNumberOf(b) - prNumberOf(a);
  });
};
