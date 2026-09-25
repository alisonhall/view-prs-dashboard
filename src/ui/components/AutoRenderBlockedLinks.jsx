/**
 * AutoRenderBlockedLinks - the clickable "jump to unsaved PR/author" chips
 * shown inside the "Auto update paused" indicator, one per PR number with
 * unsaved field edits and one per author with an unsaved manual-comment
 * draft. Matches vanilla's renderAutoRenderBlockedLinks
 * (helpers/pr-auto-render-indicator-links.helpers.js), which now only
 * toggles this list's container's `hidden`/`aria-label` attributes (via
 * index.page.js's renderAutoRenderBlockedIndicator) and calls this
 * component's own window.updateReactAutoRenderBlockedLinks bridge for the
 * actual button list - the same "vanilla chrome still drives it, React owns
 * the content" shape every other container-split conversion in this
 * migration has used.
 *
 * @module components/AutoRenderBlockedLinks
 */


export function AutoRenderBlockedLinks({ prNumbers = [], authorLogins = [] }) {
  const getAuthorInsightsDisplayName =
    window.getAuthorInsightsDisplayName || ((authorLogin) => String(authorLogin || '').trim());
  const navigateToPrInTable = window.navigateToPrInTable || (() => {});
  const navigateToAuthorInsights = window.navigateToAuthorInsights || (() => {});

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
