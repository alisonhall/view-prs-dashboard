import { useAuthorInsights } from '../../state/AuthorInsightsContext';
import { useNavigateToPrInTable } from '../../state/useNavigateToPrInTable';
import { useNavigateToAuthorInsights } from '../../state/useNavigateToAuthorInsights';
import { parsePrEntryKey } from '../../helpers/pr-entry-keys.helpers.ts';

/**
 * The auto-update-paused banner's "jump to unsaved" links: one per PR with
 * unsaved notes (shows it in the detail pane and focuses its Notes Save),
 * one per author with an unsaved Insights draft (opens Authors on them).
 * Authors' names come from AuthorInsightsContext.
 */
export interface AutoRenderBlockedLinksProps {
  // PR keys ("owner/repo#123"): the number alone can't say which repo's.
  prKeys?: readonly string[];
  authorLogins?: readonly string[];
}

export function AutoRenderBlockedLinks({ prKeys = [], authorLogins = [] }: AutoRenderBlockedLinksProps) {
  const { getAuthorInsightsDisplayName } = useAuthorInsights();
  const navigateToPrInTable = useNavigateToPrInTable();
  const navigateToAuthorInsights = useNavigateToAuthorInsights();

  return (
    <>
      {prKeys.map((prKey) => {
        const { repo, prNumber } = parsePrEntryKey(prKey);
        return (
          <button
            key={`pr-${prKey}`}
            type="button"
            className="auto-render-blocked-pr-link"
            title={`Jump to PR ${prKey} unsaved changes`}
            onClick={() => navigateToPrInTable(prNumber, { repo, focusUnsaved: true })}
          >
            {prKey}
          </button>
        );
      })}
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
