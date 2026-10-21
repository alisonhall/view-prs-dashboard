import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { DEFAULT_REPO } from '../helpers/pr-default-repo.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrCommandOutputHelpers } from '../helpers/pr-command-output.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';
import { useStatusText } from './StatusTextContext';
import { useOutputText } from './OutputTextContext';
import { usePrData } from './PrDataContext';
import { useSnackbar } from './SnackbarContext';

// Built once, not per-render - these close over nothing but each other
// (same "stable, zero-per-render-state" precedent as AuthorInsightsProvider.jsx's
// own module-level stableDisplay).
const { stripAnsi } = createPrFormattingHelpers();
const { getGithubAuthFailureHint, formatCommandOutputWithAuthHint } =
  createPrCommandOutputHelpers({ stripAnsi });

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "useSinglePrUpdate"): replaces
 * window.runSinglePrUpdate (pr-single-pr-update.helpers.js, deleted) - its
 * only real caller was already React (PrTableApp.jsx's handleUpdatePrBusy),
 * so this moves ownership of the whole workflow (status/output messages,
 * auth-hint formatting, error notification, activity tracking) into React
 * instead of a vanilla DI-factory module.
 *
 * Not a fully "clean" hook, by design, not oversight: output text and
 * in-flight request-activity tracking have no Context/hook API of their
 * own yet - only window.* bridges, the exact same pattern NotesSection.jsx
 * already uses for its own direct network call (window.beginRequestActivity,
 * bare-imported postJson). Reading those bridges here is consistent with
 * that already-accepted precedent, not a new one. statusText itself moved
 * to StatusTextProvider.jsx (Phase H.8, see REACT_MIGRATION_PLAN.md) - read
 * via useStatusText() directly now, since this hook's only caller
 * (PrTableApp.jsx) is a genuine descendant of that Provider.
 *
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * the error snackbar moved off window.showErrorNotification the same way -
 * useSnackbar() directly, same reasoning as statusText above.
 */
export function useSinglePrUpdate() {
  const { setStatusText } = useStatusText();
  const { showError } = useSnackbar();
  // Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): PrDataProvider
  // wraps the whole tree from mountAppRoot() now, so this is a genuine descendant -
  // beginRequestActivity/renderRequestActivity come from usePrData() instead of
  // window.beginRequestActivity/renderRequestActivity.
  const { beginRequestActivity } = usePrData();
  // OutputTextProvider wraps the whole tree from mountAppRoot() (Phase 3c).
  const { setOutputText } = useOutputText();

  return useCallback(async (entry, row) => {
    const prNumber = String(row?.number || entry?.prNumber || '');
    const repo = entry?.repo || DEFAULT_REPO;

    const setStatusMessage = (message) => setStatusText(message);
    const setOutputMessage = (message) => setOutputText(message);
    const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      showError(finalTitle, detail, 0);
    };

    setStatusMessage(`Updating PR #${prNumber}...`);
    setOutputMessage('');
    const finishActivity = beginRequestActivity('singlePr');

    try {
      const { response, result } = await postJson('/view-prs/run', {
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
        window.applyFreshPrPayload?.(latestData, repo);
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
  }, [setStatusText, showError, beginRequestActivity, setOutputText]);
}
