import { useMemo } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { createPrConcurrencyHelpers } from '../helpers/pr-concurrency.helpers.js';
import { createPrAckLabelActionsHelpers } from '../helpers/pr-ack-label-actions.helpers.js';

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
 * Several DI params here are themselves window.* bridges into
 * PrActivityQueueProvider.jsx (markPrsBusy/beginBulkActionBatch/etc.) -
 * read as window.* inside this hook, same as index.page.js's own
 * instantiation already does. That's intentional, not something D.2 is
 * meant to clean up - retiring those bridges in favor of direct Context
 * reads is Phase G's job.
 *
 * runAckAction/runApplyLabelAction stay internal to the factory, same as
 * index.page.js's own instantiation - only the 3 workflow entry points are
 * actually consumed by a trigger button.
 */
export function useAckLabelActions() {
  return useMemo(() => {
    const { runAckOnlyWorkflow, runClearOnlyWorkflow, runApplyLabelWorkflow } =
      createPrAckLabelActionsHelpers({
        postJson,
        setStatusMessage: (message) => window.setStatusMessage?.(message),
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
        markPrsBusy: (...args) => window.markPrsBusy?.(...args),
        clearPrsBusy: (...args) => window.clearPrsBusy?.(...args),
        markPrsQueued: (...args) => window.markPrsQueued?.(...args),
        clearPrsQueued: (...args) => window.clearPrsQueued?.(...args),
        beginBulkActionBatch: (...args) => window.beginBulkActionBatch?.(...args),
        markBulkActionChunkInFlight: (...args) => window.markBulkActionChunkInFlight?.(...args),
        markBulkActionChunkDone: (...args) => window.markBulkActionChunkDone?.(...args),
        finishBulkActionBatch: (...args) => window.finishBulkActionBatch?.(...args),
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

    return { handleAckOnly, handleClearOnly, handleApplyLabelClick };
  }, []);
}
