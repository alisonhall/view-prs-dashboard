import type { PrEntry } from '../types/pr-data.ts';
import { parseSortableTime } from './pr-sortable-time.helpers.ts';

// How a PR table section orders its rows: what by, and which way. Each
// section has a default (merged PRs by when they merged, closed ones by
// when they closed, every other section by when the PR was created -
// newest first), and a choice saved with the section's other preferences
// (pr-section-preferences.helpers.ts).
export type SectionSortField = 'created' | 'number' | 'updated' | 'merged' | 'closed';
export type SectionSortDirection = 'desc' | 'asc';

export interface SectionSort {
  by: SectionSortField;
  direction: SectionSortDirection;
}

export const SECTION_SORT_FIELD_LABELS: Record<SectionSortField, string> = {
  created: 'Date created',
  number: 'PR number',
  updated: 'Last updated',
  merged: 'Date merged',
  closed: 'Date closed',
};

export const defaultSectionSort = (sectionKey: string): SectionSort => {
  if (sectionKey === 'merged') return { by: 'merged', direction: 'desc' };
  if (sectionKey === 'closed') return { by: 'closed', direction: 'desc' };
  return { by: 'created', direction: 'desc' };
};

// What a section can sort by: a date only where its every PR has one.
export const sectionSortFields = (sectionKey: string): SectionSortField[] => [
  'created',
  'number',
  'updated',
  ...(sectionKey === 'merged' ? (['merged'] as const) : []),
  ...(sectionKey === 'closed' ? (['closed'] as const) : []),
];

export const isSectionSort = (value: unknown): value is SectionSort =>
  Boolean(value) &&
  typeof value === 'object' &&
  ['created', 'number', 'updated', 'merged', 'closed'].includes(String((value as SectionSort).by)) &&
  ['desc', 'asc'].includes(String((value as SectionSort).direction));

const prNumberOf = (entry: PrEntry) => Number(entry?.data?.number ?? entry?.prNumber ?? 0) || 0;

const DATE_FIELDS: Record<Exclude<SectionSortField, 'number' | 'created'>, 'sourceUpdatedAt' | 'mergedAt' | 'closedAt'> = {
  updated: 'sourceUpdatedAt',
  merged: 'mergedAt',
  closed: 'closedAt',
};

// When the PR was created: the row's createdAt, or - on a row saved before
// the script kept it (2026-11-13), until its next refresh - its "opened"
// activity event's time.
export const prCreatedAt = (entry: PrEntry): string => {
  const data = entry?.data;
  if (data?.createdAt) return data.createdAt;
  const events = data?.activityEvents;
  const opened = (Array.isArray(events) ? events : []).find((event) => event?.type === 'opened');
  return String(opened?.occurredAt || '');
};

// A sorted copy (the section's rows are shared). Rows without the date go
// last whichever way; ties go to the higher PR number. Each row's value is
// worked out once, not per comparison (a created date can mean a search of
// its activity events).
export const sortSectionRows = <E extends PrEntry>(rows: E[], { by, direction }: SectionSort): E[] => {
  const sign = direction === 'asc' ? 1 : -1;
  const valueOf = (entry: E): number | null => {
    if (by === 'number') return prNumberOf(entry);
    const time = parseSortableTime(by === 'created' ? prCreatedAt(entry) : entry?.data?.[DATE_FIELDS[by]]);
    return Number.isFinite(time) && time > 0 ? time : null;
  };
  return rows
    .map((entry) => ({ entry, value: valueOf(entry), number: prNumberOf(entry) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value !== b.value) return a.value === null ? 1 : -1;
      } else if (a.value !== b.value) {
        return sign * (a.value - b.value);
      }
      return b.number - a.number;
    })
    .map(({ entry }) => entry);
};

// The rows in the order they were shown (`shownKeys`), while you're working
// in their section (useHeldSectionOrder): a refresh doesn't move them. Rows
// no longer there are left out, and rows not shown before go where the
// sort puts them - just above the shown row that follows them in `sorted`.
export const holdRowOrder = <E>(sorted: E[], shownKeys: string[], keyOf: (entry: E) => string): E[] => {
  const shownIndex = new Map(shownKeys.map((key, index) => [key, index]));
  const newRowsBefore = new Map<string, E[]>();
  let newRows: E[] = [];
  sorted.forEach((entry) => {
    const key = keyOf(entry);
    if (!shownIndex.has(key)) {
      newRows.push(entry);
    } else if (newRows.length > 0) {
      newRowsBefore.set(key, newRows);
      newRows = [];
    }
  });
  const held = sorted
    .filter((entry) => shownIndex.has(keyOf(entry)))
    .sort((a, b) => (shownIndex.get(keyOf(a)) ?? 0) - (shownIndex.get(keyOf(b)) ?? 0));
  return [...held.flatMap((entry) => [...(newRowsBefore.get(keyOf(entry)) || []), entry]), ...newRows];
};
