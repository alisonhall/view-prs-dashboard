import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.js';
import { createPrTriggerAutoRunActionHelpers } from '../helpers/pr-trigger-auto-run-action.helpers.js';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.js';

/**
 * Phase H.9 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.handleTriggerAutoRun - TriggerAutoRunButton.jsx's own
 * instance (react-app.jsx) now calls this hook's returned function
 * directly. Builds its own instance of the already-pure
 * createPrTriggerAutoRunActionHelpers, same shape as useSinglePrUpdate.jsx/
 * useBackfillActions.jsx - index.page.js's own vanilla instance (and the
 * window.handleTriggerAutoRun bridge it fed) had no other caller, so both
 * are deleted outright, not kept "for tests".
 */
export function useTriggerAutoRun() {
  return useCallback(async () => {
    const notifyFailureSnackbar = (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      window.showErrorNotification?.(finalTitle, detail, 0);
    };

    const { runTriggerAutoRunWorkflow } = createPrTriggerAutoRunActionHelpers({
      postJson,
      showErrorNotification: (...args) => window.showErrorNotification?.(...args),
      notifyFailureSnackbar,
    });

    await runTriggerAutoRunWorkflow();
  }, []);
}
