import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.ts';
import { createPrBackfillHelpers, type BackfillStatus } from '../helpers/pr-backfill.helpers.ts';
import { createPrBackfillActionHelpers } from '../helpers/pr-backfill-actions.helpers.ts';
import { BACKFILL_LOG_TAIL_LINES, useBackfillStatusActions } from './BackfillStatusContext';
import { useRequestActivity } from './RequestActivityContext';
import { useStatusText } from './StatusTextContext';
import { useSetOutputText } from './OutputTextContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

// Built once, not per render.
const { stripAnsi } = createPrFormattingHelpers();
const { formatCommandOutput } = createPrCommandOutputHelpers({ stripAnsi });
const { formatBackfillLogMessage } = createPrBackfillHelpers();

// A failed status load throws with the server's result attached (see
// loadBackfillStatus in pr-backfill-actions.helpers.ts).
type BackfillLoadError = Error & { result?: BackfillStatus };

export interface BackfillActions {
  handleBackfillAction: ReturnType<typeof createPrBackfillActionHelpers>['handleBackfillAction'];
  // The "Refresh status"/"Refresh log" buttons.
  refreshBackfillStatus: () => Promise<void>;
  refreshBackfillLogTail: () => Promise<void>;
  // The Backfill tab's load on mount and on each activation.
  triggerBackfillTabLoad: () => Promise<void>;
}

/**
 * The Backfill tab's actions (BackfillControls.jsx/BackfillLogControls.jsx,
 * via AppRoot): builds createPrBackfillActionHelpers with status/output
 * text, request activity and failure snackbars.
 *
 * The backfill state it reads and writes (getBackfillTrackingState/
 * setSupportsBackfillLogPolling/setIsBackfillActionPending/
 * updateBackfillStatusFromPayload/setBackfillLogMessage/
 * renderBackfillStatus) is BackfillStatusProvider's, through its stable
 * actions Context, rather than a copy here that could drift from it (e.g.
 * a 404'd log endpoint staying "supported" here after the Provider
 * disabled it).
 *
 * Every status message also calls renderRequestActivity (see
 * useRunScript.tsx). useBackfillTabAutoRefresh.tsx calls
 * triggerBackfillTabLoad.
 */
export function useBackfillActions(): BackfillActions {
  const { setStatusText } = useStatusText();
  const notifyFailureSnackbar = useNotifyFailureSnackbar();
  // The actions-only Context: these are stable, and this hook has no use
  // for the changing status/log state.
  const {
    getBackfillTrackingState,
    setSupportsBackfillLogPolling,
    setIsBackfillActionPending,
    setBackfillButtonState,
    updateBackfillStatusFromPayload,
    renderBackfillStatus,
    setBackfillLogMessage,
  } = useBackfillStatusActions();
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  const setOutputText = useSetOutputText();

  return useMemo<BackfillActions>(() => {
    const { loadBackfillStatus, loadBackfillLogTail, handleBackfillAction } =
      createPrBackfillActionHelpers({
        fetch: (input) => fetch(input),
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
        // A no-op: BackfillLogControls.jsx keeps the log scrolled to the
        // bottom itself whenever its log text updates.
        autoScrollBackfillLogToBottom: () => {},
        formatBackfillLogMessage,
        getSupportsBackfillLogPolling: () => getBackfillTrackingState().supportsBackfillLogPolling,
        setSupportsBackfillLogPolling,
        getIsBackfillRunning: () => getBackfillTrackingState().isBackfillRunning,
        setIsBackfillActionPending,
        backfillLogTailLines: BACKFILL_LOG_TAIL_LINES,
      });

    // The "Refresh status" button: announces status changes and is tracked
    // as a "backfill" request activity.
    const refreshBackfillStatus = async () => {
      const finishActivity = beginRequestActivity('backfill');
      try {
        await loadBackfillStatus({ announce: true, includeLog: true });
      } catch (caught) {
        const error = caught as BackfillLoadError;
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

    // The tab's load on mount/activation: like refreshBackfillStatus, but
    // without announcing status changes or tracking a request activity.
    const triggerBackfillTabLoad = async () => {
      try {
        await loadBackfillStatus({ includeLog: true });
      } catch (caught) {
        const error = caught as BackfillLoadError;
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
      } catch (caught) {
        const error = caught as Error;
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
    notifyFailureSnackbar,
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
