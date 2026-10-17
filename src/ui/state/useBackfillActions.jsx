import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.js';
import { createPrBackfillActionHelpers } from '../helpers/pr-backfill-actions.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { useStatusText } from './StatusTextContext';

// Built once, not per-render - same "stable, zero-per-render-state"
// precedent as useSinglePrUpdate.jsx's own module-level instantiation.
const { stripAnsi } = createPrFormattingHelpers();
const { formatCommandOutput } = createPrCommandOutputHelpers({ stripAnsi });
const { formatBackfillLogMessage } = createPrBackfillHelpers();

// Same value as index.page.js's own BACKFILL_LOG_TAIL_LINES - duplicated
// rather than shared since index.page.js doesn't export it and this is the
// only other place that needs it.
const BACKFILL_LOG_TAIL_LINES = 120;

/**
 * Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * BackfillControls.jsx/BackfillLogControls.jsx used to reach
 * handleBackfillAction/refreshBackfillStatus/refreshBackfillLogTail via
 * window.* bridges straight into index.page.js's own
 * createPrBackfillActionHelpers instance. This hook builds its own
 * instance of the same pure factory directly instead - same shape as
 * useSinglePrUpdate.jsx.
 *
 * A handful of DI params still read/write index.page.js's own module-level
 * state via new reverse bridges (window.getBackfillTrackingState/
 * setSupportsBackfillLogPolling/setIsBackfillActionPending/
 * updateBackfillStatusFromPayload/setBackfillLogMessage/renderBackfillStatus),
 * rather than this hook forking its own independent copy - a second
 * independent copy here would silently drift from what this file's own
 * module-level state sees (e.g. a 404'd log endpoint staying "supported"
 * in this hook's copy after index.page.js's copy already disabled it).
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
 * at all. index.page.js's own
 * instance of this same factory still passes the real bridge, for its own
 * vanilla (non-React) caller.
 *
 * Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * setStatusMessage now writes statusText via useStatusText() directly
 * (this hook's only caller, AppRoot's own body, is a genuine descendant of
 * StatusTextProvider), composed with window.renderRequestActivity - same
 * reasoning as useRunScript.jsx's own comment on this exact composition.
 */
export function useBackfillActions() {
  const { setStatusText } = useStatusText();

  return useMemo(() => {
    const beginRequestActivity = window.beginRequestActivity || (() => () => {});
    const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      window.showErrorNotification?.(finalTitle, detail, 0);
    };

    const { loadBackfillStatus, loadBackfillLogTail, handleBackfillAction } =
      createPrBackfillActionHelpers({
        fetch: (...args) => fetch(...args),
        postJson,
        beginRequestActivity,
        setStatusMessage: (message) => {
          setStatusText(message);
          window.renderRequestActivity?.();
        },
        setOutputMessage: (message) => window.updateReactOutputText?.(message),
        setBackfillButtonState: (state) => window.updateReactBackfillButtonState?.(state),
        notifyFailureSnackbar,
        formatCommandOutput,
        stripAnsi,
        updateBackfillStatusFromPayload: (...args) =>
          window.updateBackfillStatusFromPayload?.(...args),
        setBackfillLogMessage: (...args) => window.setBackfillLogMessage?.(...args),
        // Phase G.4 (see REACT_MIGRATION_PLAN.md, "Full migration
        // roadmap"): a no-op here now, not window.autoScrollBackfillLogToBottom -
        // setBackfillLogMessage above already flows into
        // BackfillLogControls.jsx's own logText prop (via
        // window.updateReactBackfillLogText), which syncs scroll position
        // itself via a ref in its own useEffect. Calling the real bridge
        // here too would just be redundant for this hook's own (React)
        // caller - index.page.js's own vanilla instance of this same
        // factory still passes the real bridge, for its own non-React
        // caller.
        autoScrollBackfillLogToBottom: () => {},
        formatBackfillLogMessage,
        getSupportsBackfillLogPolling: () =>
          window.getBackfillTrackingState?.()?.supportsBackfillLogPolling ?? true,
        setSupportsBackfillLogPolling: (value) =>
          window.setSupportsBackfillLogPolling?.(value),
        getIsBackfillRunning: () =>
          window.getBackfillTrackingState?.()?.isBackfillRunning ?? false,
        setIsBackfillActionPending: (value) => window.setIsBackfillActionPending?.(value),
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
        window.renderBackfillStatus?.({
          ok: false,
          running: false,
          summary: error?.result?.summary || 'Failed to refresh backfill status',
          error: error?.result?.error || error.message,
        });
        window.setBackfillLogMessage?.('Failed to load backfill log');
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
        window.renderBackfillStatus?.({
          ok: false,
          running: false,
          summary: error?.result?.summary || 'Failed to load backfill status',
          error: error?.result?.error || error.message,
        });
        window.setBackfillLogMessage?.('Failed to load backfill log');
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
        window.setBackfillLogMessage?.(
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
  }, [setStatusText]);
}
