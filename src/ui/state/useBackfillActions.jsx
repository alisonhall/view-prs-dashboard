import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.js';
import { createPrBackfillActionHelpers } from '../helpers/pr-backfill-actions.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { BACKFILL_LOG_TAIL_LINES, useBackfillStatusActions } from './BackfillStatusContext';
import { useRequestActivity } from './RequestActivityContext';
import { useStatusText } from './StatusTextContext';
import { useSetOutputText } from './OutputTextContext';
import { useSnackbar } from './SnackbarContext';

// Built once, not per-render - same "stable, zero-per-render-state"
// precedent as useSinglePrUpdate.jsx's own module-level instantiation.
const { stripAnsi } = createPrFormattingHelpers();
const { formatCommandOutput } = createPrCommandOutputHelpers({ stripAnsi });
const { formatBackfillLogMessage } = createPrBackfillHelpers();

/**
 * Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * BackfillControls.jsx/BackfillLogControls.jsx used to reach
 * handleBackfillAction/refreshBackfillStatus/refreshBackfillLogTail via
 * window.* bridges straight into index.page.js's own
 * createPrBackfillActionHelpers instance. This hook builds its own
 * instance of the same pure factory directly instead - same shape as
 * useSinglePrUpdate.jsx.
 *
 * A handful of DI params read/write shared state owned by
 * BackfillStatusProvider (getBackfillTrackingState/setSupportsBackfillLogPolling/
 * setIsBackfillActionPending/updateBackfillStatusFromPayload/
 * setBackfillLogMessage/renderBackfillStatus - through its actions Context;
 * the window.* bridges with these names were deleted in window-bridge
 * elimination Phase 7.2), rather than this hook forking its own independent copy - a second independent copy here would
 * silently drift from what the real owner sees (e.g. a 404'd log endpoint
 * staying "supported" in this hook's copy after the real one already
 * disabled it).
 *
 * Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 4): these 6 bridges are now answered by
 * BackfillStatusProvider.jsx (components/), not index.page.js - this
 * hook's own call sites are unchanged, since the bridge names stay the
 * same; only who defines them moved.
 * Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
 * tab-activation reload/initial auto-load that used to drive this same
 * state via backfill-tab.orchestrator.js (vanilla) is now
 * useBackfillTabAutoRefresh.jsx, calling this hook's own
 * triggerBackfillTabLoad below - the orchestrator itself is deleted.
 *
 * Phase G.4 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * autoScrollBackfillLogToBottom is no longer part of this hook's own
 * returned value, and this hook's own factory instance passes a no-op for
 * that DI param (see its own inline comment) - BackfillLogControls.jsx now
 * syncs scroll position itself via a ref, reacting to its own
 * logUpdateTick prop changing (bumped on every log refresh, see
 * react-app.jsx's own comment), so this hook's React-rendering-path
 * caller no longer needs the window.autoScrollBackfillLogToBottom bridge
 * at all. index.page.js's own instance of this same factory still passes
 * the real local scroll function directly (not through a bridge) for its
 * own vanilla (non-React) caller - the bridge itself is deleted outright
 * (cluster-4 cleanup, see REACT_MIGRATION_PLAN.md, "Remaining-effort
 * audit"), confirmed to have had no readers.
 *
 * Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * setStatusMessage now writes statusText via useStatusText() directly
 * (this hook's only caller, AppRoot's own body, is a genuine descendant of
 * StatusTextProvider), composed with renderRequestActivity (from Context -
 * see useRunScript.jsx's own comment on this exact composition).
 */
export function useBackfillActions() {
  const { setStatusText } = useStatusText();
  // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // notifyFailureSnackbar below calls showError from useSnackbar() directly
  // now, same "genuine descendant, wrapped from outside AppRoot" reasoning
  // as setStatusText above.
  const { showError } = useSnackbar();
  // BackfillStatusProvider wraps AppRoot from mountAppRoot(), so this hook
  // (called from AppRoot's body) is a genuine descendant - no window.*
  // bridge needed for any of the status functions (Phase 1, 3d and 4). The
  // actions-only Context, not useBackfillStatus(): these are stable, and this
  // hook has no use for the changing status/log state.
  const {
    getBackfillTrackingState,
    setSupportsBackfillLogPolling,
    setIsBackfillActionPending,
    setBackfillButtonState,
    updateBackfillStatusFromPayload,
    renderBackfillStatus,
    setBackfillLogMessage,
  } = useBackfillStatusActions();
  // Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): PrDataProvider
  // wraps AppRoot from mountAppRoot() now, so this is a genuine descendant -
  // beginRequestActivity/renderRequestActivity come from useRequestActivity() instead of
  // window.beginRequestActivity/renderRequestActivity.
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  // OutputTextProvider wraps the whole tree from mountAppRoot() (Phase 3c).
  const setOutputText = useSetOutputText();

  return useMemo(() => {
    const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      showError(finalTitle, detail, 0);
    };

    const { loadBackfillStatus, loadBackfillLogTail, handleBackfillAction } =
      createPrBackfillActionHelpers({
        fetch: (...args) => fetch(...args),
        postJson,
        beginRequestActivity,
        setStatusMessage: (message) => {
          setStatusText(message);
          renderRequestActivity();
        },
        setOutputMessage: (message) => setOutputText(message),
        setBackfillButtonState,
        notifyFailureSnackbar,
        formatCommandOutput,
        stripAnsi,
        updateBackfillStatusFromPayload,
        setBackfillLogMessage,
        // Phase G.4 (see REACT_MIGRATION_PLAN.md, "Full migration
        // roadmap"): a no-op here now, not window.autoScrollBackfillLogToBottom -
        // setBackfillLogMessage above already flows into
        // BackfillLogControls.jsx's own logText prop (via
        // BackfillStatusProvider's backfillLogText state), which syncs scroll position
        // itself via a ref in its own useEffect. Calling the real bridge
        // here too would just be redundant for this hook's own (React)
        // caller - index.page.js's own vanilla instance of this same
        // factory still passes the real bridge, for its own non-React
        // caller.
        autoScrollBackfillLogToBottom: () => {},
        formatBackfillLogMessage,
        getSupportsBackfillLogPolling: () => getBackfillTrackingState().supportsBackfillLogPolling,
        setSupportsBackfillLogPolling,
        getIsBackfillRunning: () => getBackfillTrackingState().isBackfillRunning,
        setIsBackfillActionPending,
        backfillLogTailLines: BACKFILL_LOG_TAIL_LINES,
      });

    // Mirrors index.page.js's own refreshBackfillStatus/refreshBackfillLogTail
    // wrappers (not part of the factory) - the plain "Refresh status"/
    // "Refresh log" buttons need their own error-handling wrapper around the
    // bare loadBackfillStatus/loadBackfillLogTail calls, same as before.
    const refreshBackfillStatus = async () => {
      const finishActivity = beginRequestActivity('backfill');
      try {
        await loadBackfillStatus({ announce: true, includeLog: true });
      } catch (error) {
        renderBackfillStatus({
          ok: false,
          running: false,
          summary: error?.result?.summary || 'Failed to refresh backfill status',
          error: error?.result?.error || error.message,
        });
        setBackfillLogMessage('Failed to load backfill log');
        notifyFailureSnackbar(
          'Failed to refresh backfill status',
          error?.result || error,
          'Unable to refresh backfill status',
        );
      } finally {
        finishActivity();
      }
    };

    // Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // replaces backfill-tab.orchestrator.js's own loadStatus({includeLog:true})
    // (deleted outright, along with the orchestrator itself) - same
    // try/catch fallback verbatim, but no `announce` (the orchestrator's
    // own call never passed it, so status changes on tab-activation never
    // triggered a status-text message - only the manual "Refresh status"
    // button's refreshBackfillStatus above does that) and no
    // beginRequestActivity wrapping (the orchestrator never tracked this
    // as a request-activity badge either). useBackfillTabAutoRefresh.jsx
    // calls this on mount and on every Backfill-tab activation.
    const triggerBackfillTabLoad = async () => {
      try {
        await loadBackfillStatus({ includeLog: true });
      } catch (error) {
        renderBackfillStatus({
          ok: false,
          running: false,
          summary: error?.result?.summary || 'Failed to load backfill status',
          error: error?.result?.error || error.message,
        });
        setBackfillLogMessage('Failed to load backfill log');
        notifyFailureSnackbar(
          'Failed to load backfill status',
          error?.result || error,
          'Unable to load backfill status',
        );
      }
    };

    const refreshBackfillLogTail = async () => {
      const finishActivity = beginRequestActivity('backfill');
      try {
        await loadBackfillLogTail();
      } catch (error) {
        setBackfillLogMessage(
          `Failed to load backfill log\n\n${error.message || String(error)}`,
        );
        notifyFailureSnackbar(
          'Failed to refresh backfill log',
          error,
          'Unable to refresh backfill log',
        );
      } finally {
        finishActivity();
      }
    };

    return {
      handleBackfillAction,
      refreshBackfillStatus,
      refreshBackfillLogTail,
      triggerBackfillTabLoad,
    };
  }, [
    setStatusText,
    showError,
    getBackfillTrackingState,
    setSupportsBackfillLogPolling,
    setIsBackfillActionPending,
    setBackfillButtonState,
    updateBackfillStatusFromPayload,
    renderBackfillStatus,
    setBackfillLogMessage,
    beginRequestActivity,
    renderRequestActivity,
    setOutputText,
  ]);
}
