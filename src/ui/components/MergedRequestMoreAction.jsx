/**
 * MergedRequestMoreAction - the "Request more" button (plus its status
 * text) that fetches additional older merged PRs on demand. Matches
 * vanilla's appendMergedRequestMoreAction (formerly
 * helpers/pr-merged-request-more.helpers.js, deleted once this component
 * replaced it - see REACT_MIGRATION_PLAN.md).
 *
 * Rendered directly into its own static host (#merged-request-more-action,
 * a sibling of #pr-sections in index.html, not inside it) - React owns this
 * host's entire content now, not just a portion of it, so isVisible=false
 * renders nothing at all rather than toggling a `hidden` attribute.
 *
 * Pending/status are real local React state now (nothing else in the app
 * ever reads the old module-level isRequestMoreMergedPending variable, so
 * unlike some other converted sections there was no cross-cutting "vanilla
 * remains source of truth" concern here). The actual request logic
 * (window.handleRequestMoreMerged, wrapping
 * helpers/pr-merged-request-more-action.helpers.js) still lives in vanilla -
 * it does real async orchestration (POST /view-prs/merged/request-more,
 * updating the shared PR payload, re-rendering the table) that belongs in
 * that existing, already-tested helper, not reimplemented here. It now
 * takes onPendingChange/onStatusChange callbacks instead of reaching into
 * #merged-request-more-btn/-status by id directly.
 *
 * The old vanilla version rebuilt this button+status from scratch on every
 * render (applyRenderResults runs on every poll cycle, ~15-30s), which
 * incidentally self-cleared any status text almost immediately regardless
 * of the target repo. Real local state doesn't get that free reset, so
 * react-app.jsx mounts this with key={repo} - without it, switching the
 * repo filter mid-request (or right after one completes) would leave a
 * stale pending/status message from the *previous* repo's request showing
 * as if it described the new one.
 *
 * @module components/MergedRequestMoreAction
 */

import { useState } from 'react';

export function MergedRequestMoreAction({ isVisible, repo }) {
  const [isPending, setIsPending] = useState(false);
  const [statusText, setStatusText] = useState('');

  if (!isVisible) {
    return null;
  }

  const handleClick = () => {
    window.handleRequestMoreMerged?.(repo, {
      onPendingChange: setIsPending,
      onStatusChange: setStatusText,
    });
  };

  return (
    <>
      <button type="button" id="merged-request-more-btn" disabled={isPending} onClick={handleClick}>
        Request more
      </button>
      <span id="merged-request-more-status" className="merged-request-more-status">
        {statusText}
      </span>
    </>
  );
}
