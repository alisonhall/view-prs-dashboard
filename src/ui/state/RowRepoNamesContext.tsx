import { createContext, useContext } from 'react';

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
