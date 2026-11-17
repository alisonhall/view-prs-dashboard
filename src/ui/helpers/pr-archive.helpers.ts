import type { ArchiveSummary, PrDataPayload, PrEntry } from '../types/pr-data.ts';
import { buildPrEntryKey } from './pr-entry-keys.helpers.ts';

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
// while it matches them) - or an author or label only archived PRs have is
// picked (picksArchivedOnly).
export const tableArchiveSections = (
  shownSections: ReadonlySet<ArchivedSection>,
  filterValues: { filterSearch?: string; filterPrNumbers?: string } | null | undefined,
  picksArchivedOnly = false,
): ReadonlySet<ArchivedSection> => {
  const searching = Boolean(String(filterValues?.filterSearch || '').trim() || String(filterValues?.filterPrNumbers || '').trim());
  return searching || picksArchivedOnly ? ALL_ARCHIVED_SECTIONS : shownSections;
};

// The Author and Label lists' group for those only archived PRs have
// (FilterOptionsProvider), after the others.
export const ARCHIVED_ONLY_GROUP = 'Only in archived PRs';

// The archived authors and labels (the summary's), of `repo` when given.
export const archivedFacets = (summary: ArchiveSummary | undefined, repo?: string) => {
  const inRepo = (item: { repo?: string }) => !repo || item?.repo === repo;
  return {
    authors: (Array.isArray(summary?.authors) ? summary.authors : []).filter(inRepo),
    labels: (Array.isArray(summary?.labels) ? summary.labels : []).filter(inRepo),
  };
};

// Whether a ticked option of a list is in ARCHIVED_ONLY_GROUP: its PRs are
// all archived, so the table fetches them to show any.
export const picksArchivedOnlyOption = (
  options: ReadonlyArray<{ value: string; group?: string }> | null | undefined,
  checked: Iterable<string> | null | undefined,
  normalize: (value: unknown) => unknown = (value) => value,
): boolean => {
  const tokens = new Set(Array.from(checked || [], (value) => normalize(value)));
  if (tokens.size === 0) return false;
  return (options || []).some((option) => option.group === ARCHIVED_ONLY_GROUP && tokens.has(normalize(option.value)));
};

// The archived rows' keys in a payload, as the table's visible keys are
// built (useFilteredPrRows).
export const archivedEntryKeys = (payload: PrDataPayload | null | undefined): ReadonlySet<string> =>
  new Set(
    Object.values(payload?.byPrNumber || {})
      .filter((entry) => entry?.archived === true)
      .map((entry) => buildPrEntryKey(entry?.repo, String(entry?.data?.number ?? entry?.prNumber ?? '').trim())),
  );

// The filter bar's "Showing N of M PRs", with the archived rows the table
// has (a search, Show older) taken out of both and counted apart: M stays
// the rows the page always has, and N ones among them.
export const splitArchivedCount = (visibleKeys: readonly string[], totalCount: number, archivedKeys: ReadonlySet<string>) => {
  const archivedShown = archivedKeys.size === 0 ? 0 : visibleKeys.filter((key) => archivedKeys.has(key)).length;
  return {
    shown: visibleKeys.length - archivedShown,
    total: Math.max(0, totalCount - archivedKeys.size),
    archivedShown,
  };
};
