import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { useStatusText } from './StatusTextContext';
import { useFormBody } from './useFormBody';
import { useSnackbar } from './SnackbarContext';

// Built once, not per-render - same precedent as useSinglePrUpdate.jsx's own
// module-level instantiation.
const { stripAnsi } = createPrFormattingHelpers();
const { formatCommandOutputWithAuthHint } = createPrCommandOutputHelpers({ stripAnsi });

/**
 * Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.handleRunScript - RunScriptActionButton.jsx's "Run
 * script" instance now calls this hook's returned function directly.
 *
 * handleRunScript never had its own pure DI-factory (unlike backfill/ack-
 * label) - it was always a plain top-level function in index.page.js, so
 * (matching useSinglePrUpdate.jsx's own precedent for pieces with no
 * separate factory) its logic is inlined here rather than inventing a
 * factory that wouldn't otherwise exist.
 *
 * Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 6): window.getFormBody is gone - useFormBody() reads the same
 * fields reactively off FilterStateContext/RowFilterSelectionContext
 * instead (see that hook's own comment).
 *
 * Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * setStatusMessage now writes statusText via useStatusText() directly
 * (this hook's only caller, AppRoot's own body in react-app.jsx, is a
 * genuine descendant of StatusTextProvider), composed with the existing
 * window.renderRequestActivity bridge - the vanilla setStatusMessage this
 * used to call also triggered that re-render (so the request-activity
 * badge's elapsed time updates on every intermediate progress message,
 * not just at begin/finish), and that half isn't in scope to close yet
 * (beginRequestActivity/renderRequestActivity stay bridged - see
 * PrDataProvider.jsx's own comment for why).
 */
export function useRunScript() {
  const { setStatusText } = useStatusText();
  const getFormBody = useFormBody();
  // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // showErrorNotification below comes from useSnackbar() directly now,
  // same "genuine descendant, wrapped from outside AppRoot" reasoning as
  // setStatusText above.
  const { showError } = useSnackbar();

  return useCallback(async () => {
    const body = getFormBody();
    const setStatusMessage = (message) => {
      setStatusText(message);
      window.renderRequestActivity?.();
    };
    const setOutputMessage = (message) => window.updateReactOutputText?.(message);
    const beginRequestActivity = window.beginRequestActivity || (() => () => {});

    if (body.prNumbersInput && !body.prNumber) {
      setStatusMessage('Run script requires numeric PR number(s) in "PR number(s)"');
      return;
    }

    setStatusMessage('Running...');
    setOutputMessage('');
    const finishActivity = beginRequestActivity('runScript');

    try {
      const runTargets =
        Array.isArray(body.prNumberList) && body.prNumberList.length > 0
          ? body.prNumberList
          : [''];
      const outputChunks = [];
      const failures = [];
      const effectiveRepo = body.repo || DEFAULT_REPO;

      for (let index = 0; index < runTargets.length; index += 1) {
        const runTarget = runTargets[index];
        const runBody = { ...body, prNumber: runTarget || '' };
        const runLabel = runTarget ? `PR #${runTarget}` : 'All PRs';
        setStatusMessage(`Running ${runLabel} (${index + 1}/${runTargets.length})...`);

        const { response, result } = await postJson('/view-prs/run', runBody);

        outputChunks.push(`=== ${runLabel} ===`);
        outputChunks.push(
          formatCommandOutputWithAuthHint(result, {
            includeError: !response.ok || result?.ok === false,
          }) || 'Script completed with no output.',
        );

        if (!response.ok || result.ok === false) {
          failures.push({ prNumber: runTarget || 'all', status: response.status });
          continue;
        }

        const latestData = result.prData || null;
        if (latestData) {
          window.applyFreshPrPayload?.(latestData, effectiveRepo);
        }
      }

      if (failures.length > 0) {
        const successCount = runTargets.length - failures.length;
        const hasAuthFailure = outputChunks.some((chunk) =>
          chunk.toLowerCase().includes('auth hint:'),
        );
        setStatusMessage(
          hasAuthFailure
            ? `Completed with failures (${successCount}/${runTargets.length} successful) - GitHub auth/SSO required`
            : `Completed with failures (${successCount}/${runTargets.length} successful)`,
        );

        const failureReason = hasAuthFailure
          ? 'GitHub authentication or SSO required. Check the output below for authorization link.'
          : 'One or more requests failed. Check the output below for details.';
        const failureDetails = failures
          .map((f) => `${f.prNumber} (HTTP ${f.status})`)
          .join(', ');
        showError(`Request failed for: ${failureDetails}`, failureReason, 0);
      } else {
        setStatusMessage('Completed');
      }

      setOutputMessage(outputChunks.join('\n\n') || 'Script completed with no output.');
    } catch (error) {
      setStatusMessage('Failed (network/error)');
      showError('Request failed', String(error || 'An unknown error occurred'), 0);
      setOutputMessage(String(error));
    } finally {
      finishActivity();
    }
  }, [setStatusText, getFormBody, showError]);
}
