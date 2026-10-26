import { useAuthorInsights } from '../../state/AuthorInsightsContext';
import { useNavigateToPrInTable } from '../../state/useNavigateToPrInTable';
import { useNavigateToAuthorInsights } from '../../state/useNavigateToAuthorInsights';

/**
 * The auto-update-paused banner's "jump to unsaved" links: one per PR with
 * unsaved notes (shows it in the detail pane and focuses its Notes Save),
 * one per author with an unsaved Insights draft (opens Authors on them).
 * Authors' names come from AuthorInsightsContext.
 */
export interface AutoRenderBlockedLinksProps {
  prNumbers?: readonly string[];
  authorLogins?: readonly string[];
}

export function AutoRenderBlockedLinks({ prNumbers = [], authorLogins = [] }: AutoRenderBlockedLinksProps) {
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
