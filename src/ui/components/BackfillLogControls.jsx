import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.ts';
import { useBackfillStatus } from '../state/BackfillStatusContext';

const { shouldAutoScrollBackfillLog, getBackfillScrollTop } = createPrBackfillHelpers();

/**
 * BackfillLogControls - the Backfill tab's log-details auto-scroll
 * checkbox + "Refresh log" button, and (Phase G.4, see
 * REACT_MIGRATION_PLAN.md, "Full migration roadmap") the `#backfill-log`
 * content portal itself.
 *
 * Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces `index.page.js`'s vanilla click/change-wiring for the checkbox/
 * button. The checkbox is deliberately uncontrolled (`defaultChecked`, not
 * `checked`) - its live `.checked` value is read via `autoscrollCheckboxRef`
 * at scroll-sync time, not from any pushed React state.
 *
 * Phase G.4: previously this component didn't render the log container at
 * all - `#backfill-log` was a separate sibling portal owned directly by
 * react-app.jsx's AppRoot, which is exactly why scroll-sync needed a
 * DOM-query bridge (`window.autoScrollBackfillLogToBottom`,
 * pr-ui-option-scroll.helpers.js, both since deleted): no single component owned both the
 * checkbox and the log container to read/write via refs. Now this
 * component owns both - `logContainer` (the raw `#backfill-log` DOM node)
 * and `logText` (its content) are passed in, and this component renders
 * the log portal itself. `syncScrollPosition` reuses the same pure
 * `shouldAutoScrollBackfillLog`/`getBackfillScrollTop` functions the old
 * bridge used (pr-backfill.helpers.ts), just called directly instead of
 * through a window bridge.
 *
 * Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 4): `isBackfillRunning` now read via `useBackfillStatus()`
 * (BackfillStatusProvider.jsx, state/BackfillStatusContext.jsx) instead of
 * `window.getBackfillTrackingState()` - this component is a genuine
 * Context descendant of that Provider (mounted from mountAppRoot(),
 * wrapping <AppRoot/>, same as StatusTextProvider).
 * `window.autoScrollBackfillLogToBottom` itself (the bridge) is deleted -
 * confirmed to have no remaining readers (cluster-4 cleanup, see
 * REACT_MIGRATION_PLAN.md, "Remaining-effort audit"). index.page.js's own
 * loadBackfillStatus, the last caller of a direct auto-scroll, was deleted in
 * window-bridge elimination Phase 7.2 - every log update now reaches this
 * component's own scroll sync (logUpdateTick).
 *
 * @module components/BackfillLogControls
 */
export function BackfillLogControls({
  refreshLogDisabled,
  onRefreshLog,
  logText,
  logUpdateTick,
  logContainer,
}) {
  const autoscrollCheckboxRef = useRef(null);
  const { isBackfillRunning } = useBackfillStatus();

  const syncScrollPosition = () => {
    if (!logContainer) {
      return;
    }
    const shouldAutoScroll = shouldAutoScrollBackfillLog({
      autoScrollEnabled: Boolean(autoscrollCheckboxRef.current?.checked),
      isBackfillRunning: Boolean(isBackfillRunning),
    });
    logContainer.scrollTop = getBackfillScrollTop({
      scrollHeight: logContainer.scrollHeight,
      currentScrollTop: logContainer.scrollTop,
      shouldAutoScroll,
    });
  };

  // Scroll-on-new-log-line: fires whenever a log refresh lands, regardless
  // of whether a vanilla or React code path produced it, and regardless of
  // whether the fetched text happens to differ from what's already shown
  // (a real, common case - polling an unchanged log returns identical
  // text). Keyed on logUpdateTick, not logText itself, because
  // react-app.jsx's own useState would otherwise bail out of re-rendering
  // on a same-value update, silently skipping the scroll-sync for that
  // refresh (see react-app.jsx's own comment on backfillLogUpdateTick).
  useEffect(() => {
    syncScrollPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logUpdateTick]);

  return (
    <div className="backfill-log-options">
      <label>
        <input
          type="checkbox"
          id="backfill-log-autoscroll"
          ref={autoscrollCheckboxRef}
          defaultChecked
          onChange={() => syncScrollPosition()}
        />
        Auto-scroll log while running
      </label>
      <button
        type="button"
        id="backfill-log-refresh-btn"
        disabled={Boolean(refreshLogDisabled)}
        onClick={() => onRefreshLog?.()}
      >
        Refresh log
      </button>
      {logContainer && createPortal(logText, logContainer, 'backfill-log')}
    </div>
  );
}
