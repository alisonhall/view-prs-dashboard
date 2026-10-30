import { useCallback } from 'react';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.ts';
import { useSnackbar } from './SnackbarContext';

// Shows a failure as an error snackbar that stays until dismissed: the
// title (with "(timed out)" for timeouts) and the first useful message in
// errorSource, else fallbackMessage. The action hooks pass it to their
// helpers as notifyFailureSnackbar.
export type NotifyFailureSnackbar = (title: string, errorSource: unknown, fallbackMessage?: string) => void;

export function useNotifyFailureSnackbar(): NotifyFailureSnackbar {
  const { showError } = useSnackbar();
  return useCallback<NotifyFailureSnackbar>(
    (title, errorSource, fallbackMessage) => {
      const { title: finalTitle, detail } = buildFailureSnackbarNotification(title, errorSource, fallbackMessage);
      showError(finalTitle, detail, 0);
    },
    [showError],
  );
}
