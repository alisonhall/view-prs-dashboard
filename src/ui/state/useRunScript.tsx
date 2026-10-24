import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrCommandOutputHelpers, type CommandResult } from '../helpers/pr-command-output.helpers.ts';
import type { PrDataPayload } from '../types/pr-data.ts';
import { useStatusText } from './StatusTextContext';
import { useSetOutputText } from './OutputTextContext';
import { useRequestActivity } from './RequestActivityContext';
import { useFormBody } from './useFormBody';
import { useSnackbar } from './SnackbarContext';
import { usePrDataActions } from './PrDataActionsContext';

// Built once, not per render.
const { stripAnsi } = createPrFormattingHelpers();
const { formatCommandOutputWithAuthHint } = createPrCommandOutputHelpers({ stripAnsi });

// What POST /view-prs/run returns.
interface RunRouteResult extends CommandResult {
  ok?: boolean;
  prData?: PrDataPayload | null;
}

/**
 * The "Run script" button's action (RunScriptActionButton.jsx): runs the
 * script once per PR number in the form (or once for all PRs), collecting
 * each run's output, applying each returned payload, and reporting
 * failures (with a GitHub auth/SSO hint when the output has one).
 *
 * Every status message also calls renderRequestActivity, so the "Run
 * script" activity badge's elapsed time updates on each progress message,
 * not only at begin/finish.
 */
export function useRunScript(): () => Promise<void> {
  const { setStatusText } = useStatusText();
  const getFormBody = useFormBody();
  const { showError } = useSnackbar();
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  const setOutputText = useSetOutputText();
  const { applyFreshPrPayload } = usePrDataActions();

  return useCallback(async () => {
    const body = getFormBody();
    const setStatusMessage = (message: string) => {
      setStatusText(message);
      renderRequestActivity();
    };
    const setOutputMessage = (message: string) => setOutputText(message);

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
      const outputChunks: string[] = [];
      const failures: { prNumber: string; status: number }[] = [];
      const effectiveRepo = body.repo || DEFAULT_REPO;

      for (let index = 0; index < runTargets.length; index += 1) {
        const runTarget = runTargets[index];
        const runBody = { ...body, prNumber: runTarget || '' };
        const runLabel = runTarget ? `PR #${runTarget}` : 'All PRs';
        setStatusMessage(`Running ${runLabel} (${index + 1}/${runTargets.length})...`);

        const { response, result } = await postJson<RunRouteResult>('/view-prs/run', runBody);

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
          applyFreshPrPayload(latestData, effectiveRepo);
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
  }, [
    setStatusText,
    getFormBody,
    showError,
    beginRequestActivity,
    renderRequestActivity,
    setOutputText,
    applyFreshPrPayload,
  ]);
}
