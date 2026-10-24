import { useCallback, useRef } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import {
  createPrMergedRequestMoreActionHelpers,
  type RequestMoreCallbacks,
} from '../helpers/pr-merged-request-more-action.helpers.ts';
import type { PrDataPayload } from '../types/pr-data.ts';
import { useStatusText } from './StatusTextContext';
import { useRequestActivity } from './RequestActivityContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

export type RequestMoreMerged = (repoOverride?: string, callbacks?: RequestMoreCallbacks) => Promise<void>;

/**
 * The "Request more" merged-PRs action (MergedRequestMoreAction.jsx, via
 * MergedRequestMoreActionLive in react-app.jsx): builds
 * createPrMergedRequestMoreActionHelpers with PrDataProvider's
 * applyFreshPrPayload/loadStoredData, request activity, status text and
 * failure snackbars.
 *
 * The pending flag is a ref - a double-call guard. The button's disabled
 * state comes from MergedRequestMoreAction.jsx's own isPending state, fed
 * by onPendingChange.
 *
 * getLatestSelectedRepo is left at the helper's empty-string fallback, not
 * usePrData()'s selectedRepo: MergedRequestMoreAction.jsx always passes the
 * resolved repo (useMergedRequestMoreActionOptions' `repo`, which is
 * PrDataContext's selectedRepo) as the first argument, so that fallback is
 * never reached.
 */
export function useRequestMoreMerged(): RequestMoreMerged {
  const { setStatusText } = useStatusText();
  const notifyFailureSnackbar = useNotifyFailureSnackbar();
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  const { applyFreshPrPayload, loadStoredData } = usePrDataActions();
  const isPendingRef = useRef(false);

  return useCallback<RequestMoreMerged>(
    (repoOverride, options) => {
      const { handleRequestMoreMerged } = createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => isPendingRef.current,
        setIsRequestMoreMergedPending: (value) => {
          isPendingRef.current = value;
        },
        defaultRepo: DEFAULT_REPO,
        beginRequestActivity,
        postJson,
        // The route's prData is a full data payload.
        applyFreshPrPayload: (prData, repo) => applyFreshPrPayload(prData as PrDataPayload, repo),
        loadStoredData,
        setStatusMessage: (message) => {
          setStatusText(message);
          renderRequestActivity();
        },
        notifyFailureSnackbar,
      });

      return handleRequestMoreMerged(repoOverride, options);
    },
    [setStatusText, notifyFailureSnackbar, beginRequestActivity, renderRequestActivity, applyFreshPrPayload, loadStoredData],
  );
}
