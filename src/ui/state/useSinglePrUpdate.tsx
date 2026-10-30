import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrCommandOutputHelpers, type CommandResult } from '../helpers/pr-command-output.helpers.ts';
import type { PrData, PrDataPayload, PrEntry } from '../types/pr-data.ts';
import { useStatusText } from './StatusTextContext';
import { useSetOutputText } from './OutputTextContext';
import { useRequestActivity } from './RequestActivityContext';
import { usePrDataActions } from './PrDataActionsContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

// Built once, not per render: they depend only on each other.
const { stripAnsi } = createPrFormattingHelpers();
const { getGithubAuthFailureHint, formatCommandOutputWithAuthHint } =
  createPrCommandOutputHelpers({ stripAnsi });

// What POST /view-prs/run returns.
interface RunRouteResult extends CommandResult {
  ok?: boolean;
  prData?: PrDataPayload | null;
}

export type SinglePrUpdate = (
  entry: Pick<PrEntry, 'prNumber' | 'repo'> | null | undefined,
  row: Pick<PrData, 'number'> | null | undefined,
) => Promise<void>;

/**
 * PrTableApp.tsx's per-row "Update" action: runs the script for one PR
 * (POST /view-prs/run), showing progress in the status and output text,
 * an auth hint and failure snackbar on error, and applying the returned
 * payload with applyFreshPrPayload. Tracked as a "singlePr" request
 * activity.
 */
export function useSinglePrUpdate(): SinglePrUpdate {
  const { setStatusText } = useStatusText();
  const notifyFailureSnackbar = useNotifyFailureSnackbar();
  const { beginRequestActivity } = useRequestActivity();
  const setOutputText = useSetOutputText();
  const { applyFreshPrPayload } = usePrDataActions();

  return useCallback<SinglePrUpdate>(async (entry, row) => {
    const prNumber = String(row?.number || entry?.prNumber || '');
    const repo = entry?.repo || DEFAULT_REPO;

    const setStatusMessage = (message: string) => setStatusText(message);
    const setOutputMessage = (message: string) => setOutputText(message);

    setStatusMessage(`Updating PR #${prNumber}...`);
    setOutputMessage('');
    const finishActivity = beginRequestActivity('singlePr');

    try {
      const { response, result } = await postJson<RunRouteResult>('/view-prs/run', {
        repo,
        prNumber,
        openMode: 'none',
        quiet: true,
      });

      if (!response.ok || result.ok === false) {
        setStatusMessage(`Failed to update PR #${prNumber}`);
        const authHint = getGithubAuthFailureHint(result);
        if (authHint) {
          setStatusMessage(`Failed to update PR #${prNumber} (GitHub auth required)`);
        }
        setOutputMessage(formatCommandOutputWithAuthHint(result, { includeStderr: false }));
        notifyFailureSnackbar(
          `Update failed for PR #${prNumber}`,
          result,
          `Failed to update PR #${prNumber}`,
        );
        return;
      }

      setStatusMessage(`PR #${prNumber} updated`);
      setOutputMessage(result.output ? stripAnsi(result.output) : '');

      const latestData = result.prData || null;
      if (latestData) {
        applyFreshPrPayload(latestData, repo);
      }
    } catch (error) {
      setStatusMessage(`Failed to update PR #${prNumber}`);
      setOutputMessage(String(error));
      notifyFailureSnackbar(
        `Update failed for PR #${prNumber}`,
        error,
        `Failed to update PR #${prNumber}`,
      );
    } finally {
      finishActivity();
    }
  }, [setStatusText, notifyFailureSnackbar, beginRequestActivity, setOutputText, applyFreshPrPayload]);
}
