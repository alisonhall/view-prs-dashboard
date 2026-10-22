import { useCallback, useRef } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrMergedRequestMoreActionHelpers } from '../helpers/pr-merged-request-more-action.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { useStatusText } from './StatusTextContext';
import { useRequestActivity } from './RequestActivityContext';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';

/**
 * Ninth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * replaces window.handleRequestMoreMerged - MergedRequestMoreAction.jsx's
 * own instance (via MergedRequestMoreActionLive in react-app.jsx) now calls
 * this hook's returned function directly, instead of going through
 * index.page.js's own vanilla instance (deleted outright, confirmed no
 * other caller). Builds its own instance of the already-pure
 * createPrMergedRequestMoreActionHelpers, same shape as useBackfillActions.jsx/
 * useTriggerAutoRun.jsx.
 *
 * getIsRequestMoreMergedPending/setIsRequestMoreMergedPending - the old
 * vanilla module-level `let isRequestMoreMergedPending` - become a
 * `useRef`, scoped to this hook's own caller (MergedRequestMoreAction.jsx
 * already disables its button while pending via its own local isPending
 * state fed by onPendingChange, so this ref is a belt-and-suspenders
 * double-call guard, not the UI's own disabled-state source of truth -
 * same relationship the original vanilla version had).
 *
 * getLatestSelectedRepo intentionally stays an empty-string fallback, not
 * usePrData()'s selectedRepo - MergedRequestMoreAction.jsx always passes a
 * real, already-resolved repo as this function's first argument (see
 * useMergedRequestMoreActionOptions.jsx's own comment: its `repo` prop IS
 * PrDataContext's selectedRepo), so that fallback path is dead in practice
 * for this hook's one real caller; not worth a PrDataProvider dependency
 * for an unreachable branch.
 */
export function useRequestMoreMerged() {
  const { setStatusText } = useStatusText();
  const { showError } = useSnackbar();
  // Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): PrDataProvider
  // wraps the whole tree from mountAppRoot() now, so this is a genuine descendant -
  // beginRequestActivity/renderRequestActivity come from useRequestActivity() instead of
  // window.beginRequestActivity/renderRequestActivity.
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  // Window-bridge elimination Phase 7: was window.applyFreshPrPayload/
  // loadStoredData (index.page.js); PrDataProvider owns both now.
  const { applyFreshPrPayload, loadStoredData } = usePrDataActions();
  const isPendingRef = useRef(false);

  return useCallback(
    (repoOverride, options) => {
      const { handleRequestMoreMerged } = createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => isPendingRef.current,
        setIsRequestMoreMergedPending: (value) => {
          isPendingRef.current = value;
        },
        defaultRepo: DEFAULT_REPO,
        beginRequestActivity,
        postJson,
        applyFreshPrPayload,
        loadStoredData,
        setStatusMessage: (message) => {
          setStatusText(message);
          renderRequestActivity();
        },
        notifyFailureSnackbar: (title, errorSource, fallbackMessage) => {
          const { title: finalTitle, detail } = buildFailureSnackbarNotification(
            title,
            errorSource,
            fallbackMessage,
          );
          showError(finalTitle, detail, 0);
        },
      });

      return handleRequestMoreMerged(repoOverride, options);
    },
    [setStatusText, showError, beginRequestActivity, renderRequestActivity, applyFreshPrPayload, loadStoredData],
  );
}
