/**
 * AuthorInsightsPrDataMeta - React port of createAuthorInsightsPrDataMeta()
 * built in helpers/pr-author-insights-display.helpers.js: a status/
 * approved/CHK/conversations/viewed-files/labels meta row for a PR entry.
 * Shared by AuthorCreatedPrsSection.jsx and AuthorInsightsNotesSection.jsx
 * (Track B, REACT_MIGRATION_PLAN.md).
 *
 * Still reads some underlying formatting helpers off window (toCount,
 * parseMarkerState, formatChkDisplay, getViewedFilesSummary, asArray)
 * since those are pure data-shaping functions shared with the vanilla PR
 * table cells and orchestration-level concerns outside this cluster.
 * getAuthorInsightsCreatedPrStatus/getAuthorInsightsStatusBadgeClassName/
 * getOpenConversationCount now come from useAuthorInsights() (Phase 7,
 * sub-phase 7.0 - see REACT_MIGRATION_PLAN.md).
 *
 * `children` renders after the standard meta items, matching
 * buildCreatedPrsSection's own extra "merged/updated date" detail, which
 * always appended into the same meta node after the rest was built.
 *
 * @module components/AuthorInsightsPrDataMeta
 */

import { useAuthorInsights } from '../state/AuthorInsightsContext';

const toCount = (value) => (window.toCount ? window.toCount(value) : Number.parseInt(value, 10) || 0);
const asArray = (value) => (window.asArray ? window.asArray(value) : Array.isArray(value) ? value : []);

export function AuthorInsightsPrDataMeta({ entry, children }) {
  const { getAuthorInsightsCreatedPrStatus, getAuthorInsightsStatusBadgeClassName, getOpenConversationCount } =
    useAuthorInsights();
  const row = entry?.data || {};
  const status = getAuthorInsightsCreatedPrStatus(entry);
  const statusClassName = getAuthorInsightsStatusBadgeClassName(status);
  const approvedLabel = `${String(row?.approved || '-').trim() || '-'} (${toCount(row?.approvalCount)})`;
  const chkState = window.parseMarkerState ? window.parseMarkerState(row?.titleDisplay, 'CHK') || '-' : '-';
  const chkDisplay = window.formatChkDisplay ? window.formatChkDisplay(chkState, row?.failureCount) : chkState;
  const conversationCount = getOpenConversationCount(row);
  const viewedFilesSummary = window.getViewedFilesSummary ? window.getViewedFilesSummary(row) : '';
  const labelsCount = asArray(row?.labels).filter(Boolean).length;

  return (
    <div className="author-insights-meta">
      <span className={`author-insights-badge ${statusClassName}`.trim()}>{`Status: ${status}`}</span>
      <span className="author-insights-meta-detail">{`Approved: ${approvedLabel}`}</span>
      <span className="author-insights-meta-detail">{`CHK: ${chkDisplay}`}</span>
      <span className="author-insights-meta-detail">{`Conversations: ${conversationCount}`}</span>
      <span className="author-insights-meta-detail">{viewedFilesSummary}</span>
      {labelsCount > 0 && <span className="author-insights-meta-detail">{`Labels: ${labelsCount}`}</span>}
      {children}
    </div>
  );
}
