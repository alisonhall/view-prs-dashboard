/**
 * AuthorInsightsPrLink - React port of the PR-link fragment
 * createAuthorInsightsPrLink() built in
 * helpers/pr-author-insights-pr-link.helpers.js: an external GitHub link
 * plus a "View in table" button that navigates the PR data tab to this
 * row. Shared by AuthorCreatedPrsSection.jsx and
 * AuthorInsightsNotesSection.jsx (Track B, REACT_MIGRATION_PLAN.md).
 *
 * The navigation itself stays a window bridge
 * (window.navigateToPrInTableFromAuthorInsights, wrapping the same
 * prAuthorInsightsPrLinkHelpers.navigateToPrInTable used by Review Stats'
 * "View in table" buttons) since it depends on tab-activation/DOM-query
 * orchestration index.page.js still owns - moving that is Track C's
 * concern, not this one.
 *
 * @module components/AuthorInsightsPrLink
 */

import React from 'react';

export function AuthorInsightsPrLink({ entry }) {
  const row = entry?.data || {};
  const prNumber = String(row.number || entry?.prNumber || '').trim();
  const defaultRepo = window.DEFAULT_REPO || '';
  const href = row.url || `https://github.com/${entry?.repo || defaultRepo}/pull/${prNumber}`;
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
        onClick={() => window.navigateToPrInTableFromAuthorInsights?.(prNumber, entry?.repo)}
      >
        View in table
      </button>
    </div>
  );
}
