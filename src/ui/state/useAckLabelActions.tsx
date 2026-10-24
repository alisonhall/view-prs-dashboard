import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.ts';
import { createPrConcurrencyHelpers } from '../helpers/pr-concurrency.helpers.ts';
import { createPrAckLabelActionsHelpers } from '../helpers/pr-ack-label-actions.helpers.ts';
import { summarizeAckRefreshWarnings } from '../helpers/pr-ack-refresh-warnings.helpers.ts';
import { parseCsvTokens } from '../helpers/form-parsing.helpers.ts';
import { usePrActivityQueue } from './PrActivityQueueContext';
import { useStatusText } from './StatusTextContext';
import { useSetOutputText } from './OutputTextContext';
import { useRequestActivity } from './RequestActivityContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useFormBody } from './useFormBody';
import { useSnackbar } from './SnackbarContext';

// Built once, not per render.
const { stripAnsi } = createPrFormattingHelpers();
const { getGithubAuthFailureHint, formatCommandOutput, formatCommandOutputWithAuthHint } =
  createPrCommandOutputHelpers({ stripAnsi });
const { runWithConcurrencyLimit } = createPrConcurrencyHelpers();

type AckLabelHelpers = ReturnType<typeof createPrAckLabelActionsHelpers>;

export interface AckLabelActions {
  // The bulk buttons: act on the form's PR numbers/labels.
  handleAckOnly: () => Promise<void>;
  handleClearOnly: () => Promise<void>;
  handleApplyLabelClick: () => Promise<void>;
  // The per-PR forms, used by PrTableApp.jsx's row actions.
  runAckOnlyWorkflow: AckLabelHelpers['runAckOnlyWorkflow'];
  runClearOnlyWorkflow: AckLabelHelpers['runClearOnlyWorkflow'];
  runApplyLabelWorkflow: AckLabelHelpers['runApplyLabelWorkflow'];
}

/**
 * The Ack, Clear and Apply-label actions: RunScriptActionButton.jsx's bulk
 * buttons (handleAckOnly/handleClearOnly/handleApplyLabelClick) and
 * PrTableApp.jsx's per-row actions (the run*Workflow functions, from a
 * second instance of this hook). Builds createPrAckLabelActionsHelpers
 * with PrDataProvider's data pipeline, the form body, status/output text,
 * snackbars and request activity.
 *
 * The busy/queued markers come from usePrActivityQueue(), whose functions
 * mark one PR at a time (markPrBusy(prNumber, repo)) where the helper
 * passes a list, so they're wrapped in a loop; the 4 bulk-batch functions
 * match the helper's shape and are passed through.
 */
export function useAckLabelActions(): AckLabelActions {
  const {
    markPrBusy,
    clearPrBusy,
    markPrQueued,
    clearPrQueued,
    beginBulkActionBatch,
    markBulkActionChunkInFlight,
    markBulkActionChunkDone,
    finishBulkActionBatch,
  } = usePrActivityQueue();
  // Every status message also calls renderRequestActivity (see
  // useRunScript.tsx).
  const { setStatusText } = useStatusText();
  const getFormBody = useFormBody();
  const { showError, showWarning } = useSnackbar();
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  const setOutputText = useSetOutputText();
  const { applyFreshPrPayload, loadStoredData, getLatestStoredPayload } = usePrDataActions();

  return useMemo<AckLabelActions>(() => {
    const { runAckOnlyWorkflow, runClearOnlyWorkflow, runApplyLabelWorkflow } =
      createPrAckLabelActionsHelpers({
        postJson,
        setStatusMessage: (message) => {
          setStatusText(message);
          renderRequestActivity();
        },
        setOutputMessage: (message) => setOutputText(message),
        beginRequestActivity,
        getGithubAuthFailureHint,
        formatCommandOutput,
        formatCommandOutputWithAuthHint,
        showErrorNotification: showError,
        showWarningNotification: showWarning,
        summarizeAckRefreshWarnings,
        applyFreshPrPayload,
        loadStoredData,
        getFormBody,
        defaultRepo: DEFAULT_REPO,
        parseCsvTokens,
        markPrsBusy: (prNumbers, repo) =>
          (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => markPrBusy(prNumber, repo)),
        clearPrsBusy: (prNumbers, repo) =>
          (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => clearPrBusy(prNumber, repo)),
        markPrsQueued: (prNumbers, repo) =>
          (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => markPrQueued(prNumber, repo)),
        clearPrsQueued: (prNumbers, repo) =>
          (Array.isArray(prNumbers) ? prNumbers : []).forEach((prNumber) => clearPrQueued(prNumber, repo)),
        beginBulkActionBatch: (batch) => beginBulkActionBatch(batch),
        markBulkActionChunkInFlight: (chunk) => markBulkActionChunkInFlight(chunk),
        markBulkActionChunkDone: (chunk) => markBulkActionChunkDone(chunk),
        finishBulkActionBatch: (batch) => finishBulkActionBatch(batch),
        runWithConcurrencyLimit,
        getLatestStoredPayload,
      });

    const handleAckOnly = async () => {
      await runAckOnlyWorkflow();
    };
    const handleClearOnly = async () => {
      await runClearOnlyWorkflow();
    };
    const handleApplyLabelClick = async () => {
      const select = document.getElementById('apply-label-select') as HTMLSelectElement | null;
      await runApplyLabelWorkflow('', select ? select.value : '', '');
    };

    return {
      handleAckOnly,
      handleClearOnly,
      handleApplyLabelClick,
      runAckOnlyWorkflow,
      runClearOnlyWorkflow,
      runApplyLabelWorkflow,
    };
  }, [
    markPrBusy,
    clearPrBusy,
    markPrQueued,
    clearPrQueued,
    beginBulkActionBatch,
    markBulkActionChunkInFlight,
    markBulkActionChunkDone,
    finishBulkActionBatch,
    setStatusText,
    getFormBody,
    showError,
    beginRequestActivity,
    renderRequestActivity,
    setOutputText,
    showWarning,
    applyFreshPrPayload,
    loadStoredData,
    getLatestStoredPayload,
  ]);
}
