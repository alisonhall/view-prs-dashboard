import { useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { createPrRowCheckboxActionsHelpers } from '../helpers/pr-row-checkbox-actions.helpers.ts';
import { useStatusText } from './StatusTextContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity } from './RequestActivityContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

/**
 * PrTableApp.tsx's per-row in-review/flagged checkbox toggles: builds
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
  const notifyFailureSnackbar = useNotifyFailureSnackbar();
  const { applyLatestPrData, loadStoredData } = usePrDataActions();

  return useMemo(() => {
    const { toggleInReviewForRow, toggleFlaggedForRow } = createPrRowCheckboxActionsHelpers({
      fetchFn: (input, init) => fetch(input, init),
      setStatusTextOnly: (message) => setStatusText(message),
      notifyFailureSnackbar,
      getLatestStoredPayload: () => payload,
      getLatestSelectedRepo: () => selectedRepo,
      applyLatestPrData,
      loadStoredData,
      beginRequestActivity,
    });

    return { toggleInReviewForRow, toggleFlaggedForRow };
  }, [payload, selectedRepo, setStatusText, notifyFailureSnackbar, beginRequestActivity, applyLatestPrData, loadStoredData]);
}
