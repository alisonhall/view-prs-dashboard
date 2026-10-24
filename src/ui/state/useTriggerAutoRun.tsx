import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { createPrTriggerAutoRunActionHelpers } from '../helpers/pr-trigger-auto-run-action.helpers.ts';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.ts';
import { useSnackbar } from './SnackbarContext';

/**
 * The "Trigger auto run" button's action (TriggerAutoRunButton.jsx, via
 * react-app.jsx): builds createPrTriggerAutoRunActionHelpers with
 * postJson and failure snackbars from useSnackbar().
 */
export function useTriggerAutoRun(): () => Promise<void> {
  const { showError } = useSnackbar();

  return useCallback(async () => {
    const notifyFailureSnackbar = (title: string, errorSource: unknown, fallbackMessage?: string) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(
        title,
        errorSource,
        fallbackMessage,
      );
      showError(finalTitle, detail, 0);
    };

    const { runTriggerAutoRunWorkflow } = createPrTriggerAutoRunActionHelpers({
      postJson,
      showErrorNotification: showError,
      notifyFailureSnackbar,
    });

    await runTriggerAutoRunWorkflow();
  }, [showError]);
}
