import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePrData } from './PrDataContext';
import { rowRepoNamesFor } from '../helpers/pr-repo-grouping.helpers.ts';

/**
 * What each row calls its repo (shortRepoNames), when rows from more than
 * one repo are in view (PrTableApp provides it): then each row says which
 * repo its PR is in (PrTitleCell), as the number alone doesn't. Null -
 * rows don't say it - outside a provider, with rows from one repo, and
 * under "Group rows by repo" headings.
 */
export const RowRepoNamesContext = createContext<ReadonlyMap<string, string> | null>(null);

// The row's name for its repo; empty when rows don't say it.
export const useRowRepoName = (repo: string): string => {
  const names = useContext(RowRepoNamesContext);
  if (!names || !repo) return '';
  return names.get(repo) || repo;
};

/**
 * Provides what the stored PRs call their repos (rowRepoNamesFor), for
 * views outside the table that list PRs from them: Review stats' sources
 * and the Authors view's PRs. Like the table, PRs only say their repo once
 * the stored PRs come from more than one.
 */
export function StoredPrRepoNamesProvider({ children }: { children?: ReactNode }) {
  const { payload } = usePrData();
  const names = useMemo(
    () => rowRepoNamesFor(Object.values(payload?.byPrNumber || {}), String(payload?.lastRun?.repo || '').trim()),
    [payload],
  );
  return <RowRepoNamesContext.Provider value={names}>{children}</RowRepoNamesContext.Provider>;
}
