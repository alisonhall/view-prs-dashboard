import { useCallback } from 'react';
import { postJson } from '../helpers/pr-http.helpers.ts';
import { createPrTriggerAutoRunActionHelpers } from '../helpers/pr-trigger-auto-run-action.helpers.ts';
import { useSnackbar } from './SnackbarContext';
import { useNotifyFailureSnackbar } from './useNotifyFailureSnackbar';

/**
 * The "Trigger auto run" button's action (TriggerAutoRunButton.jsx, via
 * react-app.jsx): builds createPrTriggerAutoRunActionHelpers with
 * postJson and failure snackbars from useSnackbar().
 */
export function useTriggerAutoRun(): () => Promise<void> {
  const { showError } = useSnackbar();
  const notifyFailureSnackbar = useNotifyFailureSnackbar();

  return useCallback(async () => {
    const { runTriggerAutoRunWorkflow } = createPrTriggerAutoRunActionHelpers({
      postJson,
      showErrorNotification: showError,
      notifyFailureSnackbar,
    });

    await runTriggerAutoRunWorkflow();
  }, [showError, notifyFailureSnackbar]);
}
