import type { ArchiveSummary, PrDataPayload, PrEntry } from '../types/pr-data.ts';

// Merged and closed PRs past the archive cutoff (the script moves them to
// the archive file): /data goes without them, and the views that need them
// ask (PrArchiveContext).

export type ArchivedSection = 'merged' | 'closed';

export const archivedCount = (summary: ArchiveSummary | undefined, section?: ArchivedSection): number => {
  const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  if (section) return count(summary?.[section]);
  return count(summary?.merged) + count(summary?.closed);
};

// The payload with the archived rows added (only those of `sections`, when
// given). A PR the payload has is the payload's. The same payload when
// there's nothing to add, so what it feeds doesn't rebuild.
export const mergeArchivedRows = (
  payload: PrDataPayload,
  archivedRows: Record<string, PrEntry> | null | undefined,
  sections?: ReadonlySet<string>,
): PrDataPayload => {
  if (!archivedRows || (sections && sections.size === 0)) return payload;
  const base = payload?.byPrNumber || {};
  const added: Record<string, PrEntry> = {};
  let count = 0;
  Object.entries(archivedRows).forEach(([key, entry]) => {
    if (base[key] || !entry) return;
    if (sections && !sections.has(String(entry.section || ''))) return;
    added[key] = entry.archived === true ? entry : { ...entry, archived: true };
    count += 1;
  });
  if (count === 0) return payload;
  return { ...payload, byPrNumber: { ...added, ...base } };
};

// Whether Review stats' dates reach the archived PRs' events: no start
// date (all time), or one on or before the newest day any of them can be
// on - so its numbers are the same as before they were archived.
export const reviewStatsReachesArchive = (summary: ArchiveSummary | undefined, startDate: string | undefined): boolean => {
  if (archivedCount(summary) === 0) return false;
  const start = String(startDate || '').trim();
  if (!start) return true;
  const newestDay = String(summary?.newestEventAt || '').slice(0, 10);
  // Counted but with no date: as if it could be in range.
  if (!newestDay) return true;
  return start <= newestDay;
};

const ALL_ARCHIVED_SECTIONS: ReadonlySet<ArchivedSection> = new Set<ArchivedSection>(['merged', 'closed']);

// The archived sections the table adds: those whose "Show older" was
// pressed, and every one while the search or PR number field has something
// in it - so a search finds archived PRs too (they show in their sections
// while it matches them).
export const tableArchiveSections = (
  shownSections: ReadonlySet<ArchivedSection>,
  filterValues: { filterSearch?: string; filterPrNumbers?: string } | null | undefined,
): ReadonlySet<ArchivedSection> => {
  const searching = Boolean(String(filterValues?.filterSearch || '').trim() || String(filterValues?.filterPrNumbers || '').trim());
  return searching ? ALL_ARCHIVED_SECTIONS : shownSections;
};
