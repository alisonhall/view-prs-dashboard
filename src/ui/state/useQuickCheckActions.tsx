import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { createPrQuickCheckActionsHelpers } from '../helpers/pr-quick-check-actions.helpers.ts';
import { createPrSchedulerStatusHelpers } from '../helpers/pr-scheduler-status.helpers.ts';
import { usePrActivityQueue } from './PrActivityQueueContext';
import { useFormBody } from './useFormBody';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity, type RequestActivityValue } from './RequestActivityContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

const QUICK_CHECK_BUTTON_LABEL = 'Quick check';
const QUICK_CHECK_ALL_BUTTON_LABEL = 'Quick check all';

const buildQuickCheckCountLabel = (pendingTotal: number): string =>
  pendingTotal > 0
    ? `${pendingTotal} update${pendingTotal === 1 ? '' : 's'} found`
    : 'No changes found';

type QuickCheckHelpers = ReturnType<typeof createPrQuickCheckActionsHelpers>;

export interface QuickCheckActions {
  handleQuickCheck: () => ReturnType<QuickCheckHelpers['runQuickCheckWorkflow']>;
  handleQuickCheckAll: () => ReturnType<QuickCheckHelpers['runQuickCheckAllWorkflow']>;
}

/**
 * The "Quick check" and "Quick check all" buttons' actions
 * (QuickCheckButton.jsx, and the app header's QuickCheckAllButton, via
 * AppShell):
 * builds createPrQuickCheckActionsHelpers with the form body, the newest
 * stored payload (PrDataProvider's), the per-PR busy markers
 * (usePrActivityQueue, which marks one PR at a time, so they're wrapped in
 * a loop) and snackbars.
 *
 * Its own pr-scheduler-status.helpers.ts instance reloads the scheduler
 * status after a check, calling RequestActivityProvider's
 * renderSchedulerStatus for the scheduler state and the active-PR progress
 * indicator.
 */
export function useQuickCheckActions(): QuickCheckActions {
  const { markPrBusy, clearPrBusy } = usePrActivityQueue();
  const getFormBody = useFormBody();
  const { showError, showWarning } = useSnackbar();
  const notifyFailureSnackbar = useNotifyFailureSnackbar();
  const { getLatestStoredPayload } = usePrDataActions();
  const { renderSchedulerStatus } = useRequestActivity();

  return useMemo<QuickCheckActions>(() => {
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({
      fetch: (input) => fetch(input),
      // The /view-prs/scheduler response is the scheduler snapshot.
      renderSchedulerStatus: (scheduler) =>
        renderSchedulerStatus(scheduler as Parameters<RequestActivityValue['renderSchedulerStatus']>[0]),
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
  }, [
    markPrBusy,
    clearPrBusy,
    getFormBody,
    showError,
    showWarning,
    notifyFailureSnackbar,
    getLatestStoredPayload,
    renderSchedulerStatus,
  ]);
}
