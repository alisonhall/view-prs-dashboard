/**
 * AutoRenderBlockedStatusText - the auto-render-blocked indicator's status
 * line, Context-backed.
 *
 * Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces `index.page.js`'s vanilla `renderAutoRenderBlockedIndicator`
 * writing this text directly via `statusNode.textContent = ...`.
 *
 * @module components/AutoRenderBlockedStatusText
 */

import { useAutoRenderBlocking } from '../state/AutoRenderBlockingContext';

export function AutoRenderBlockedStatusText() {
  const { statusText } = useAutoRenderBlocking();
  return (
    <div id="auto-render-blocked-status" className="auto-render-blocked-status">
      {statusText}
    </div>
  );
}
