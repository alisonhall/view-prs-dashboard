import { useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { createPrRowCheckboxActionsHelpers } from '../helpers/pr-row-checkbox-actions.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { useStatusText } from './StatusTextContext';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useRequestActivity } from './RequestActivityContext';

/**
 * Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.* indirection for PrTableApp.jsx's per-row checkbox
 * (in-review/flagged) toggle - its only real caller was already React
 * (PrTableApp.jsx's own handleCheckboxChange, built from
 * react-callbacks.helpers.js's vanilla createReactCallbacks() until now).
 * Same shape useSinglePrUpdate.jsx already established: wraps an
 * existing, already-tested DI-factory (pr-row-checkbox-actions.helpers.js)
 * with Context-sourced state where it's available (payload/selectedRepo,
 * via usePrData()) and window.* bridges for the pieces that stay
 * vanilla-owned for now (beginRequestActivity/loadStoredData/
 * applyLatestPrData - the last one only syncs index.page.js's own vanilla
 * payload/repo mirror, it doesn't touch React at all, so the caller still
 * needs to separately push into Context - see PrTableApp.jsx's own
 * comment).
 *
 * Not a fully "clean" hook, by design, matching useSinglePrUpdate.jsx's
 * own precedent exactly, not a new one. statusText itself moved to
 * StatusTextProvider.jsx (Phase H.8, see REACT_MIGRATION_PLAN.md) - read
 * via useStatusText() directly now, same as useSinglePrUpdate.jsx.
 *
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * showErrorNotification comes from useSnackbar() directly now too, same
 * reasoning as statusText above.
 */
export function useRowCheckboxActions() {
  const { payload, selectedRepo } = usePrData();
  // Window-bridge elimination Phase 7.3: request activity is
  // RequestActivityProvider's now, not part of usePrData().
  const { beginRequestActivity } = useRequestActivity();
  const { setStatusText } = useStatusText();
  const { showError } = useSnackbar();
  // Window-bridge elimination Phase 7: was window.applyLatestPrData/
  // loadStoredData (index.page.js); PrDataProvider owns both now.
  const { applyLatestPrData, loadStoredData } = usePrDataActions();

  return useMemo(() => {
    const { toggleInReviewForRow, toggleFlaggedForRow } = createPrRowCheckboxActionsHelpers({
      fetchFn: (...args) => fetch(...args),
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
