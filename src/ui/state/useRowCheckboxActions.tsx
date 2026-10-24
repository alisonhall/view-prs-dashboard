import { useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { createPrRowCheckboxActionsHelpers } from '../helpers/pr-row-checkbox-actions.helpers.ts';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.ts';
import { useStatusText } from './StatusTextContext';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity } from './RequestActivityContext';

/**
 * PrTableApp.jsx's per-row in-review/flagged checkbox toggles: builds
 * createPrRowCheckboxActionsHelpers with PrDataContext's payload/
 * selectedRepo, PrDataProvider's applyLatestPrData/loadStoredData, request
 * activity, status text and failure snackbars. applyLatestPrData only
 * records the newest stored payload; PrTableApp then puts the result on
 * screen with applyFreshTablePayload.
 */
export function useRowCheckboxActions() {
  const { payload, selectedRepo } = usePrData();
  const { beginRequestActivity } = useRequestActivity();
  const { setStatusText } = useStatusText();
  const { showError } = useSnackbar();
  const { applyLatestPrData, loadStoredData } = usePrDataActions();

  return useMemo(() => {
    const { toggleInReviewForRow, toggleFlaggedForRow } = createPrRowCheckboxActionsHelpers({
      fetchFn: (input, init) => fetch(input, init),
      setStatusTextOnly: (message) => setStatusText(message),
      notifyFailureSnackbar: (title, errorSource, fallbackMessage) => {
        const { title: finalTitle, detail } = buildFailureSnackbarNotification(
          title,
          errorSource,
          fallbackMessage,
        );
        showError(finalTitle, detail, 0);
      },
      getLatestStoredPayload: () => payload,
      getLatestSelectedRepo: () => selectedRepo,
      applyLatestPrData,
      loadStoredData,
      beginRequestActivity,
    });

    return { toggleInReviewForRow, toggleFlaggedForRow };
  }, [payload, selectedRepo, setStatusText, showError, beginRequestActivity, applyLatestPrData, loadStoredData]);
}
