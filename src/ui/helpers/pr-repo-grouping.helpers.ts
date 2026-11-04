import type { PrEntry } from '../types/pr-data.ts';

export interface PrRepoGroup<E> {
  // Null: the rows aren't grouped (one group, no heading).
  repo: string | null;
  rows: E[];
}

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
