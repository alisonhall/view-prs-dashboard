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

import { useEffect } from 'react';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { useAutoRenderBlocking } from '../state/AutoRenderBlockingContext';
import { createPrAutoRenderIndicatorHelpers } from '../helpers/pr-auto-render-indicator.helpers.ts';
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

/**
 * Window-bridge elimination Phase 7.4: the chips as react-app.jsx mounts them
 * (portaled into the static #auto-render-blocked-pr-links element, passed
 * here as `container`). Reads the blocking PRs/authors from
 * AutoRenderBlockingProvider, and sets the container's own `hidden` (when
 * nothing blocks) and `aria-label` (the PR label, or the blocking authors'
 * display names). Both used to come from index.page.js: the attributes from
 * renderAutoRenderBlockedLinks, the lists through
 * window.updateReactAutoRenderBlockedLinks into AppRoot state. Needs an
 * AuthorInsightsProvider ancestor for the display names.
 */
export function AutoRenderBlockedLinksLive({ container }) {
  const { blockingPrNumbers, blockingAuthorInsightsLogins, blockingPrLabel } = useAutoRenderBlocking();
  const { getAuthorInsightsDisplayName } = useAuthorInsights();

  useEffect(() => {
    const { buildAutoRenderBlockedLinksAriaLabel } = createPrAutoRenderIndicatorHelpers({
      getAuthorInsightsDisplayName,
    });
    container.hidden = blockingPrNumbers.length === 0 && blockingAuthorInsightsLogins.length === 0;
    container.setAttribute(
      'aria-label',
      buildAutoRenderBlockedLinksAriaLabel({ blockingPrLabel, blockingAuthorInsightsLogins }),
    );
  }, [container, blockingPrNumbers, blockingAuthorInsightsLogins, blockingPrLabel, getAuthorInsightsDisplayName]);

  return <AutoRenderBlockedLinks prNumbers={blockingPrNumbers} authorLogins={blockingAuthorInsightsLogins} />;
}
