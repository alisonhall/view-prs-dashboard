import { usePrDescription } from '../../state/usePrDescription';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { useMarkdownAttachmentSource } from '../../state/MarkdownAttachmentContext';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

/**
 * The detail pane's Description tab: the PR's description as GitHub shows
 * it, rendered from its Markdown (sanitized, as comments are). Fetched
 * when the tab is opened (usePrDescription); a copy the server couldn't
 * refresh says so, and one that couldn't be fetched at all offers to try
 * again.
 */
export function PrDescriptionTab({ repo, prNumber, updatedAt }: { repo: string; prNumber: string; updatedAt: string }) {
  const { description, loading, error, retry } = usePrDescription(repo, prNumber, updatedAt);
  const { renderMarkdownAsHtml } = usePrInsightsDisplay();
  const attachmentSource = useMarkdownAttachmentSource();

  if (loading) return <p className="pr-description-note">Loading the description…</p>;
  if (error || !description) {
    return (
      <p className="pr-pane-detail-error" role="alert">
        Couldn't load the description: {error || 'unknown error'}{' '}
        <button type="button" className="ui-link-button" onClick={retry}>
          Try again
        </button>
      </p>
    );
  }
  const html = renderMarkdownAsHtml(description.body, attachmentSource);
  return (
    <div className="pr-description">
      {description.stale && (
        <p className="pr-description-note" role="status">
          Couldn&apos;t refresh it from GitHub ({description.warning || 'unknown error'}), so this is the copy from{' '}
          {formatIsoDatetime(description.fetchedAt || '')}.{' '}
          <button type="button" className="ui-link-button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {html ? (
        <div className="pr-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="pr-description-note">No description.</p>
      )}
    </div>
  );
}
