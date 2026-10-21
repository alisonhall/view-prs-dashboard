/**
 * BackfillControls - the Backfill tab's 3 action buttons (Start/Stop/
 * Refresh status), Context-free and callback-injected.
 *
 * Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces `index.page.js`'s vanilla click-wiring for these 3 buttons.
 * `disabled` comes from `buttonState` (BackfillStatusProvider's state, read
 * back by AppRoot and set by that Provider's status render - since Phase 3d,
 * no longer pushed through `window.updateReactBackfillButtonState` -
 * itself derived from `getBackfillStatusViewModel` - see that helper's own
 * comment for why this is richer than a simple in-flight "pending" flag:
 * Start also stays disabled while a backfill is already running, Stop
 * stays disabled while it isn't, independent of any request in flight).
 * The business logic itself (POST /view-prs/backfill/start|stop, status
 * reload) stays in `index.page.js`'s `handleBackfillAction`/
 * `refreshBackfillStatus`, reached here only via the injected
 * `onStart`/`onStop`/`onRefreshStatus` callbacks - same shape as
 * `TriggerAutoRunButton.jsx`'s `onTrigger` prop.
 *
 * @module components/BackfillControls
 */

export function BackfillControls({ buttonState, onStart, onStop, onRefreshStatus }) {
  const state = buttonState || {};
  return (
    <div className="form-actions">
      <button type="button" id="backfill-start-btn" disabled={Boolean(state.startDisabled)} onClick={() => onStart?.()}>
        Start backfill
      </button>
      <button type="button" id="backfill-stop-btn" disabled={Boolean(state.stopDisabled)} onClick={() => onStop?.()}>
        Stop backfill
      </button>
      <button
        type="button"
        id="backfill-refresh-btn"
        disabled={Boolean(state.refreshDisabled)}
        onClick={() => onRefreshStatus?.()}
      >
        Refresh status
      </button>
    </div>
  );
}
