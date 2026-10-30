import { useMemo } from 'react';
import { Icon } from '../ui/Icon';
import { AutoRenderBlockedLinks } from './AutoRenderBlockedLinks';
import { useAuthorInsights } from '../../state/AuthorInsightsContext';
import { useAutoRenderBlocking } from '../../state/AutoRenderBlockingContext';
import { createPrAutoRenderIndicatorHelpers } from '../../helpers/pr-auto-render-indicator.helpers.ts';

// The "jump to unsaved" links: one per PR with unsaved notes, one per
// author with an unsaved Insights draft.
function BlockedLinks() {
  const { blockingPrNumbers, blockingAuthorInsightsLogins, blockingPrLabel } = useAutoRenderBlocking();
  const { getAuthorInsightsDisplayName } = useAuthorInsights();
  const label = useMemo(
    () =>
      createPrAutoRenderIndicatorHelpers({ getAuthorInsightsDisplayName }).buildAutoRenderBlockedLinksAriaLabel({
        blockingPrLabel,
        blockingAuthorInsightsLogins,
      }),
    [getAuthorInsightsDisplayName, blockingPrLabel, blockingAuthorInsightsLogins],
  );
  if (!blockingPrNumbers.length && !blockingAuthorInsightsLogins.length) return null;
  return (
    <div id="auto-render-blocked-pr-links" className="auto-render-blocked-pr-links" role="group" aria-label={label}>
      <AutoRenderBlockedLinks prNumbers={blockingPrNumbers} authorLogins={blockingAuthorInsightsLogins} />
    </div>
  );
}

/**
 * The banner under the app header while new data is held back because
 * something is unsaved (AutoRenderBlockingContext): what's waiting, a link
 * to each unsaved edit, and "Discard unsaved" to drop them and show the
 * new data.
 *
 * Always in the page (hidden when nothing is held back), so the polite
 * live region is there before it has anything to say. Its root
 * (#app-banner-root) sticks to the top of the window, so it stays in view
 * however far down you are editing. Mount inside AuthorInsightsProvider
 * (for authors' names).
 */
export function AutoUpdatePausedBanner() {
  const { isBlocked, statusText, discardAndApply } = useAutoRenderBlocking();
  return (
    <div
      id="auto-render-blocked-indicator"
      className="app-banner"
      role="status"
      aria-label="Auto update paused"
      aria-live="polite"
      aria-atomic="true"
      hidden={!isBlocked}
    >
      <Icon name="alert" />
      <div className="app-banner-text">
        <strong className="app-banner-title">Auto update paused</strong>
        <span id="auto-render-blocked-status" className="auto-render-blocked-status">
          {statusText}
        </span>
      </div>
      <BlockedLinks />
      <button type="button" id="auto-render-blocked-apply-btn" className="app-banner-action" onClick={discardAndApply}>
        Discard unsaved
      </button>
    </div>
  );
}
