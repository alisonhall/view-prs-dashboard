import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { createPrQuickCheckActionsHelpers } from '../helpers/pr-quick-check-actions.helpers.js';
import { createPrSchedulerStatusHelpers } from '../helpers/pr-scheduler-status.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { usePrActivityQueue } from './PrActivityQueueContext';
import { useFormBody } from './useFormBody';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity } from './RequestActivityContext';

const QUICK_CHECK_BUTTON_LABEL = 'Quick check';
const QUICK_CHECK_ALL_BUTTON_LABEL = 'Quick check all';

const buildQuickCheckCountLabel = (pendingTotal) =>
  pendingTotal > 0
    ? `${pendingTotal} update${pendingTotal === 1 ? '' : 's'} found`
    : 'No changes found';

/**
 * Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.handleQuickCheck/handleQuickCheckAll -
 * QuickCheckButton.jsx/QuickCheckAllButton.jsx's own instances (react-app.jsx)
 * now call this hook's returned functions directly. Builds its own
 * createPrQuickCheckActionsHelpers instance, same shape as
 * useAckLabelActions.jsx - index.page.js's own vanilla instance (and the 2
 * window.* bridges it fed) had no other caller, so both are deleted
 * outright, not kept "for tests".
 *
 * markPrsBusy/clearPrsBusy come from usePrActivityQueue() directly instead
 * of window.markPrsBusy/clearPrsBusy - same per-PR-loop wrapping
 * useAckLabelActions.jsx's own instance already uses, valid for the same
 * reason (this hook's callers are genuine descendants of
 * PrActivityQueueProvider - react-app.jsx's mountAppRoot wraps it from
 * outside AppRoot). getLatestStoredPayload stays a window.* bridge - a
 * vanilla-module-state read with no Context equivalent, same "DOM is
 * correctly the source of truth" category as every other hook in this
 * file that reads it.
 *
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * showErrorNotification/showWarningNotification come from useSnackbar()
 * directly now too, same reasoning as markPrsBusy/clearPrsBusy above -
 * SnackbarProvider also wraps from outside AppRoot.
 *
 * Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 6): window.getFormBody is gone - useFormBody() reads the same
 * fields reactively off FilterStateContext/RowFilterSelectionContext
 * instead (see that hook's own comment). getLatestStoredPayload stays a
 * window.* bridge, unaffected by this.
 *
 * Phase H.24 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 1): window.loadSchedulerStatus is gone too - this hook now
 * builds its own instance of helpers/pr-scheduler-status.helpers.js
 * directly (same "every live consumer builds its own separate instance"
 * pattern every other Context in this migration already uses), reading
 * window.renderSchedulerStatus only for the one genuinely-vanilla,
 * SSE-shared side effect (the active-PR progress indicator) that instance
 * still needs - not for loadSchedulerStatus's own control flow.
 */
export function useQuickCheckActions() {
  const { markPrBusy, clearPrBusy } = usePrActivityQueue();
  const getFormBody = useFormBody();
  const { showError, showWarning } = useSnackbar();
  // Window-bridge elimination Phase 7: was window.getLatestStoredPayload
  // (index.page.js); the newest stored payload is PrDataProvider's now.
  const { getLatestStoredPayload } = usePrDataActions();
  // Window-bridge elimination Phase 7.3: was window.renderSchedulerStatus
  // (index.page.js); RequestActivityProvider owns it now.
  const { renderSchedulerStatus } = useRequestActivity();

  return useMemo(() => {
    const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      showError(finalTitle, detail, 0);
    };

    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({
      fetch: (...args) => fetch(...args),
      renderSchedulerStatus,
    });

    const { runQuickCheckWorkflow, runQuickCheckAllWorkflow } = createPrQuickCheckActionsHelpers({
      showErrorNotification: showError,
      showWarningNotification: showWarning,
      notifyFailureSnackbar,
      loadSchedulerStatus,
      postJson,
      getFormBody,
      getLatestStoredPayload,
      markPrsBusy: (prNumbers, repo) =>
        (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => markPrBusy(prNumber, repo)),
      clearPrsBusy: (prNumbers, repo) =>
        (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => clearPrBusy(prNumber, repo)),
    });

    const handleQuickCheck = () =>
      runQuickCheckWorkflow({
        fallbackLabel: QUICK_CHECK_BUTTON_LABEL,
        buildSuccessLabel: ({ pendingTotal }) => buildQuickCheckCountLabel(pendingTotal),
      });

    const handleQuickCheckAll = () =>
      runQuickCheckAllWorkflow({
        fallbackLabel: QUICK_CHECK_ALL_BUTTON_LABEL,
        buildSuccessLabel: ({ pendingTotal, reposChecked }) =>
          pendingTotal > 0
            ? `${buildQuickCheckCountLabel(pendingTotal)} across ${reposChecked.length} repo${
                reposChecked.length === 1 ? '' : 's'
              }`
            : 'No changes found',
      });

    return { handleQuickCheck, handleQuickCheckAll };
  }, [markPrBusy, clearPrBusy, getFormBody, showError, showWarning, getLatestStoredPayload, renderSchedulerStatus]);
}
