import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';

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
 * factory that wouldn't otherwise exist. window.getFormBody (new bridge,
 * see index.page.js) stays a bridge rather than being ported, since the
 * form read itself depends on several other DOM-backed helpers
 * (getSelectedIncludeLabelNames etc.) that are their own "DOM is correctly
 * the source of truth" permanent category, not something this hook should
 * re-implement.
 */
export function useRunScript() {
  return useCallback(async () => {
    const body = window.getFormBody?.() || {};
    const setStatusMessage = (message) => window.setStatusMessage?.(message);
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
        window.showErrorNotification?.(`Request failed for: ${failureDetails}`, failureReason, 0);
      } else {
        setStatusMessage('Completed');
      }

      setOutputMessage(outputChunks.join('\n\n') || 'Script completed with no output.');
    } catch (error) {
      setStatusMessage('Failed (network/error)');
      window.showErrorNotification?.(
        'Request failed',
        String(error || 'An unknown error occurred'),
        0,
      );
      setOutputMessage(String(error));
    } finally {
      finishActivity();
    }
  }, []);
}
