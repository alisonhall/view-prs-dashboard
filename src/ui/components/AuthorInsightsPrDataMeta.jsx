/**
 * AuthorInsightsPrDataMeta - React port of createAuthorInsightsPrDataMeta()
 * built in helpers/pr-author-insights-display.helpers.js: a status/
 * approved/CHK/conversations/viewed-files/labels meta row for a PR entry.
 * Shared by AuthorCreatedPrsSection.jsx and AuthorInsightsNotesSection.jsx
 * (Track B, REACT_MIGRATION_PLAN.md).
 *
 * Phase 7 (see REACT_MIGRATION_PLAN.md): toCount/formatChkDisplay/
 * getViewedFilesSummary used to be read off window too, deferred as one
 * "Track C" atomic unit - re-investigated and found all 3 are genuinely
 * zero-dependency (toCount: createPrFormattingHelpers(), no args;
 * formatChkDisplay: the same zero-arg createPrStatusDisplayHelpers()
 * isChangedStatus/statusIcon already import directly elsewhere;
 * getViewedFilesSummary: createPrViewedFilesSummaryHelpers({ toCount }),
 * the exact same composition PrInsightsDisplayProvider.jsx already builds
 * at module scope) - no Context needed, now built the same way here.
 * getAuthorInsightsCreatedPrStatus/getAuthorInsightsStatusBadgeClassName/
 * getOpenConversationCount come from useAuthorInsights() (Phase 7,
 * sub-phase 7.0 - see REACT_MIGRATION_PLAN.md).
 *
 * A real, pre-existing bug fixed along the way (flagged back in sub-phase
 * 7.0's own writeup as needing a fix "whenever Track C is tackled"): the
 * old call was `formatChkDisplay(chkState, row?.failureCount)`, passing an
 * already-parsed marker value and a second argument the real function
 * doesn't accept - formatChkDisplay's actual signature takes the raw
 * `titleDisplay` string and does its own `[CHK:...]` regex extraction
 * internally (the exact same regex parseMarkerState used to redundantly
 * apply first here). Passing an already-extracted value like "PASS"
 * through that same regex never matches (no brackets), so this always
 * silently rendered "-" in production - masked only because this
 * component's own tests stubbed window.formatChkDisplay with a
 * differently-shaped mock. Fixed by calling
 * `formatChkDisplay(row?.titleDisplay)` directly; parseMarkerState is no
 * longer needed here at all as a result.
 *
 * `children` renders after the standard meta items, matching
 * buildCreatedPrsSection's own extra "merged/updated date" detail, which
 * always appended into the same meta node after the rest was built.
 *
 * @module components/AuthorInsightsPrDataMeta
 */

import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { asArray } from '../helpers/pr-as-array.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrViewedFilesSummaryHelpers } from '../helpers/pr-viewed-files-summary.helpers.js';

const { toCount } = createPrFormattingHelpers();
const { formatChkDisplay } = createPrStatusDisplayHelpers();
const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers({ toCount });

export function AuthorInsightsPrDataMeta({ entry, children }) {
  const { getAuthorInsightsCreatedPrStatus, getAuthorInsightsStatusBadgeClassName, getOpenConversationCount } =
    useAuthorInsights();
  const row = entry?.data || {};
  const status = getAuthorInsightsCreatedPrStatus(entry);
  const statusClassName = getAuthorInsightsStatusBadgeClassName(status);
  const approvedLabel = `${String(row?.approved || '-').trim() || '-'} (${toCount(row?.approvalCount)})`;
  const chkDisplay = formatChkDisplay(row?.titleDisplay);
  const conversationCount = getOpenConversationCount(row);
  const viewedFilesSummary = getViewedFilesSummary(row);
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
