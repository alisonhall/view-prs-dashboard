/**
 * AuthorInsightsPrLink - React port of the PR-link fragment
 * createAuthorInsightsPrLink() built in
 * helpers/pr-author-insights-pr-link.helpers.js (since deleted): an external GitHub link
 * plus a "View in table" button that navigates the PR data tab to this
 * row. Shared by AuthorCreatedPrsSection.jsx and
 * AuthorInsightsNotesSection.jsx (Track B, REACT_MIGRATION_PLAN.md).
 *
 * Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2): the navigation itself now goes through
 * useNavigateToPrInTable() (state/) instead of the
 * window.navigateToPrInTableFromAuthorInsights bridge (deleted outright,
 * along with its sibling window.navigateToPrInTableFromStats) -
 * AutoRenderBlockedLinks.jsx already used that exact hook for the same
 * tab-switch+dispatch behavior; it only needed a `repo` option added (see
 * the hook's own comment) to match what this caller needs.
 *
 * @module components/AuthorInsightsPrLink
 */

import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';

export function AuthorInsightsPrLink({ entry }) {
  const navigateToPrInTable = useNavigateToPrInTable();
  const row = entry?.data || {};
  const prNumber = String(row.number || entry?.prNumber || '').trim();
  const href = row.url || `https://github.com/${entry?.repo || DEFAULT_REPO}/pull/${prNumber}`;
  const label = `#${prNumber} ${String(row.title || row.titleDisplay || '').trim()}`;

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <a className="author-insights-link" href={href} target="_blank" rel="noopener noreferrer" title="Open PR on GitHub">
        {label}
      </a>
      <button
        type="button"
        className="author-insights-table-link"
        title="Navigate to PR data tab and scroll to this PR"
        onClick={() => navigateToPrInTable(prNumber, { repo: entry?.repo })}
      >
        View in table
      </button>
    </div>
  );
}
