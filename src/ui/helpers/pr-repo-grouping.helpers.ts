import type { PrEntry } from '../types/pr-data.ts';

export interface PrRepoGroup<E> {
  // Null: the rows aren't grouped (one group, no heading).
  repo: string | null;
  rows: E[];
}

// What a row calls its repo, by repo: the name alone ("web" for
// acme/web) - unless repos from more than one owner share it (in any
// case, as GitHub's names are), which keep their full name.
export const shortRepoNames = (repos: Iterable<string>): Map<string, string> => {
  const unique = [...new Set(Array.from(repos, (repo) => String(repo || '').trim()).filter(Boolean))];
  const nameOf = (repo: string) => repo.slice(repo.lastIndexOf('/') + 1) || repo;
  const keyOf = (repo: string) => nameOf(repo).toLowerCase();
  const counts = new Map<string, number>();
  unique.forEach((repo) => counts.set(keyOf(repo), (counts.get(keyOf(repo)) ?? 0) + 1));
  return new Map(unique.map((repo) => [repo, (counts.get(keyOf(repo)) ?? 0) > 1 ? repo : nameOf(repo)]));
};

// What the rows call their repos, once they come from more than one (null
// before then: rows don't say it). A row without a repo of its own is the
// default repo's, as PrTable shows it.
export const rowRepoNamesFor = (entries: Iterable<Pick<PrEntry, 'repo'> | null | undefined>, defaultRepo: string): Map<string, string> | null => {
  const names = shortRepoNames(Array.from(entries, (entry) => String(entry?.repo || defaultRepo || '')));
  return names.size > 1 ? names : null;
};

// A section's rows grouped by repo (Settings › Appearance's "Group rows by
// repo"): a group per repo, A-Z, each keeping the rows' order. Not grouped
// when it's off, or the rows all come from one repo - a lone heading would
// say nothing.
export const groupRowsByRepo = <E extends Pick<PrEntry, 'repo'>>(rows: E[], groupByRepo: boolean): PrRepoGroup<E>[] => {
  if (!groupByRepo) return [{ repo: null, rows }];
  const byRepo = new Map<string, E[]>();
  rows.forEach((row) => {
    const repo = String(row?.repo || '');
    byRepo.set(repo, [...(byRepo.get(repo) || []), row]);
  });
  if (byRepo.size < 2) return [{ repo: null, rows }];
  return [...byRepo.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((repo) => ({ repo: repo || 'No repo', rows: byRepo.get(repo) || [] }));
};
