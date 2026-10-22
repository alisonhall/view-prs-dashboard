/**
 * AutoRenderBlockedLinks - the clickable "jump to unsaved PR/author" chips
 * shown inside the "Auto update paused" indicator, one per PR number with
 * unsaved field edits and one per author with an unsaved manual-comment
 * draft. Presentational: react-app.jsx's AutoRenderBlockedLinksLive passes
 * the lists from AutoRenderBlockingProvider and sets the container's
 * `hidden`/`aria-label` (window-bridge elimination Phase 7.4). Before that,
 * index.page.js's renderAutoRenderBlockedLinks set those attributes and
 * pushed the lists through window.updateReactAutoRenderBlockedLinks.
 *
 * getAuthorInsightsDisplayName comes from useAuthorInsights() (Phase 7,
 * sub-phase 7.0 - see REACT_MIGRATION_PLAN.md).
 *
 * Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
 * 2 navigation functions are real hooks now, not window.* bridges -
 * window.navigateToPrInTable/navigateToAuthorInsights (and the vanilla
 * helper file that built them) were retired outright.
 *
 * @module components/AutoRenderBlockedLinks
 */

import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';
import { useNavigateToAuthorInsights } from '../state/useNavigateToAuthorInsights';

export function AutoRenderBlockedLinks({ prNumbers = [], authorLogins = [] }) {
  const { getAuthorInsightsDisplayName } = useAuthorInsights();
  const navigateToPrInTable = useNavigateToPrInTable();
  const navigateToAuthorInsights = useNavigateToAuthorInsights();

  return (
    <>
      {prNumbers.map((prNumber) => (
        <button
          key={`pr-${prNumber}`}
          type="button"
          className="auto-render-blocked-pr-link"
          title={`Jump to PR #${prNumber} unsaved changes`}
          onClick={() => navigateToPrInTable(prNumber, { focusUnsaved: true })}
        >
          {`#${prNumber}`}
        </button>
      ))}
      {authorLogins.map((authorLogin) => {
        const authorDisplayName = getAuthorInsightsDisplayName(authorLogin);
        return (
          <button
            key={`author-${authorLogin}`}
            type="button"
            className="auto-render-blocked-pr-link"
            title={`Jump to unsaved Author Insights draft for ${authorDisplayName}`}
            onClick={() => navigateToAuthorInsights(authorLogin, { focusUnsaved: true })}
          >
            {`Author: ${authorDisplayName}`}
          </button>
        );
      })}
    </>
  );
}
