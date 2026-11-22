/**
 * AuthorPrLinkRow - one PR in an Authors list: `repo#N title` linking to
 * GitHub, a short detail (a wait, a size, what it's waiting on), and View
 * in table. Used by the stats' Show PRs lists and Waiting now.
 *
 * @module components/AuthorPrLinkRow
 */

import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';
import { useRowRepoName } from '../state/RowRepoNamesContext';
import type { PrEntry } from '../types/pr-data.ts';

export function AuthorPrLinkRow({ entry, detail }: { entry: PrEntry; detail?: string }) {
  const navigateToPrInTable = useNavigateToPrInTable();
  const row = entry?.data || {};
  const prNumber = String(row.number || entry?.prNumber || '').trim();
  const repo = String(entry?.repo || '');
  const repoName = useRowRepoName(repo);
  const href = row.url || `https://github.com/${repo}/pull/${prNumber}`;
  return (
    <li className="author-stats-source">
      <a className="author-stats-source-title" href={href} target="_blank" rel="noopener noreferrer">
        {[`${repoName}#${prNumber}`, String(row.title || '').trim()].filter(Boolean).join(' ')}
      </a>
      {detail && <span className="author-stats-source-value">{detail}</span>}
      <button
        type="button"
        className="ui-link-button"
        onClick={(event) => navigateToPrInTable(prNumber, { repo, from: event.currentTarget })}
      >
        View in table
      </button>
    </li>
  );
}

export const authorPrRowKey = (entry: PrEntry) => `${entry?.repo || ''}#${entry?.prNumber || entry?.data?.number}`;
