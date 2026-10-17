import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { createPrConcurrencyHelpers } from '../helpers/pr-concurrency.helpers.js';
import { createPrAckLabelActionsHelpers } from '../helpers/pr-ack-label-actions.helpers.js';
import { usePrActivityQueue } from './PrActivityQueueContext';
import { useStatusText } from './StatusTextContext';

// Built once, not per-render - same precedent as useSinglePrUpdate.jsx's own
// module-level instantiation.
const { stripAnsi } = createPrFormattingHelpers();
const { getGithubAuthFailureHint, formatCommandOutput, formatCommandOutputWithAuthHint } =
  createPrCommandOutputHelpers({ stripAnsi });
const { runWithConcurrencyLimit } = createPrConcurrencyHelpers();

// Mirrors index.page.js's own parseCsvTokens exactly - trivial and pure
// enough that duplicating it here beats adding a bridge for 3 lines.
const parseCsvTokens = (rawValue) =>
  String(rawValue || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

/**
 * Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.handleAckOnly/handleClearOnly/handleApplyLabelClick -
 * RunScriptActionButton.jsx's 3 matching instances now call this hook's
 * returned functions directly. Builds its own createPrAckLabelActionsHelpers
 * instance, same shape as useSinglePrUpdate.jsx and useBackfillActions.jsx.
 *
 * Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
 * busy/queued/bulk-batch DI params now come from usePrActivityQueue()
 * directly instead of window.markPrsBusy/beginBulkActionBatch/etc. - valid
 * now that <AppRoot /> (this hook's only caller) is a real descendant of
 * PrActivityQueueProvider (react-app.jsx's mountAppRoot wraps it from
 * outside - see that Provider's own header comment for why it has to be
 * wrapped from there, not nested inside AppRoot's own JSX). The 4
 * busy/queued Context functions are singular/per-PR
 * (markPrBusy(prNumber, repo)) where the factory wants plural/array-taking
 * (markPrsBusy(prNumbers, repo)) - wrapped in the same per-PR loop
 * PrActivityQueueProvider.jsx's own window-bridge effect already uses, not
 * forwarded 1:1. The 4 bulk-batch functions match the factory's expected
 * shape exactly - direct passthrough.
 *
 * runAckAction/runApplyLabelAction stay internal to the factory, same as
 * index.page.js's own instantiation - only the 3 workflow entry points are
 * actually consumed by a trigger button.
 */
export function useAckLabelActions() {
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
  // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // setStatusMessage below now writes statusText via useStatusText()
  // directly (both this hook's callers - AppRoot's own body and
  // PrTableApp.jsx's per-row instance - are genuine descendants of
  // StatusTextProvider), composed with window.renderRequestActivity - same
  // reasoning as useRunScript.jsx's own comment on this exact composition.
  const { setStatusText } = useStatusText();

  return useMemo(() => {
    const { runAckOnlyWorkflow, runClearOnlyWorkflow, runApplyLabelWorkflow } =
      createPrAckLabelActionsHelpers({
        postJson,
        setStatusMessage: (message) => {
          setStatusText(message);
          window.renderRequestActivity?.();
        },
        setOutputMessage: (message) => window.updateReactOutputText?.(message),
        beginRequestActivity: window.beginRequestActivity || (() => () => {}),
        getGithubAuthFailureHint,
        formatCommandOutput,
        formatCommandOutputWithAuthHint,
        showErrorNotification: (...args) => window.showErrorNotification?.(...args),
        showWarningNotification: (...args) => window.showWarningNotification?.(...args),
        summarizeAckRefreshWarnings: (...args) => window.summarizeAckRefreshWarnings?.(...args),
        applyFreshPrPayload: (...args) => window.applyFreshPrPayload?.(...args),
        loadStoredData: (...args) => window.loadStoredData?.(...args),
        getFormBody: () => window.getFormBody?.(),
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
        beginBulkActionBatch: (...args) => beginBulkActionBatch(...args),
        markBulkActionChunkInFlight: (...args) => markBulkActionChunkInFlight(...args),
        markBulkActionChunkDone: (...args) => markBulkActionChunkDone(...args),
        finishBulkActionBatch: (...args) => finishBulkActionBatch(...args),
        runWithConcurrencyLimit,
        getLatestStoredPayload: () => window.getLatestStoredPayload?.(),
      });

    const handleAckOnly = async () => {
      await runAckOnlyWorkflow();
    };
    const handleClearOnly = async () => {
      await runClearOnlyWorkflow();
    };
    const handleApplyLabelClick = async () => {
      const select = document.getElementById('apply-label-select');
      await runApplyLabelWorkflow('', select ? select.value : '', '');
    };

    return {
      handleAckOnly,
      handleClearOnly,
      handleApplyLabelClick,
      // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // the raw per-PR workflow functions, now also consumed directly by
      // PrTableApp.jsx's own per-row Ack/Apply-Label handlers (a second
      // instance of this hook) - previously only the bulk, no-arg forms
      // above were returned.
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
  ]);
}
