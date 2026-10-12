import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.js';
import { createPrBackfillActionHelpers } from '../helpers/pr-backfill-actions.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';

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
 * handleBackfillAction/refreshBackfillStatus/refreshBackfillLogTail/
 * autoScrollBackfillLogToBottom via window.* bridges straight into
 * index.page.js's own createPrBackfillActionHelpers instance. This hook
 * builds its own instance of the same pure factory directly instead - same
 * shape as useSinglePrUpdate.jsx.
 *
 * A handful of DI params still read/write index.page.js's own module-level
 * state via new reverse bridges (window.getBackfillTrackingState/
 * setSupportsBackfillLogPolling/setIsBackfillActionPending/
 * updateBackfillStatusFromPayload/setBackfillLogMessage/renderBackfillStatus),
 * rather than this hook forking its own independent copy - that state is
 * also driven by index.page.js's own backfill tab orchestrator (tab-
 * activation reload) and initial auto-load, so a second independent copy
 * here would silently drift from what the orchestrator sees (e.g. a 404'd
 * log endpoint staying "supported" in this hook's copy after index.page.js's
 * copy already disabled it).
 */
export function useBackfillActions() {
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
        setStatusMessage: (message) => window.setStatusMessage?.(message),
        setOutputMessage: (message) => window.updateReactOutputText?.(message),
        setBackfillButtonState: (state) => window.updateReactBackfillButtonState?.(state),
        notifyFailureSnackbar,
        formatCommandOutput,
        stripAnsi,
        updateBackfillStatusFromPayload: (...args) =>
          window.updateBackfillStatusFromPayload?.(...args),
        setBackfillLogMessage: (...args) => window.setBackfillLogMessage?.(...args),
        autoScrollBackfillLogToBottom: (...args) =>
          window.autoScrollBackfillLogToBottom?.(...args),
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
      autoScrollBackfillLogToBottom: (...args) =>
        window.autoScrollBackfillLogToBottom?.(...args),
    };
  }, []);
}
