/**
 * AutoRenderBlockedApplyButton - the auto-render-blocked indicator's
 * "Discard unsaved" button, Context-backed.
 *
 * Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces `index.page.js`'s vanilla `forceApplyPendingAutoRender`'s
 * click-wiring.
 *
 * @module components/AutoRenderBlockedApplyButton
 */

import { useAutoRenderBlocking } from '../state/AutoRenderBlockingContext';

export function AutoRenderBlockedApplyButton() {
  const { discardAndApply } = useAutoRenderBlocking();
  return (
    <button type="button" id="auto-render-blocked-apply-btn" onClick={discardAndApply}>
      Discard unsaved
    </button>
  );
}
