import { createContext, useContext } from 'react';

/**
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * the error/warning snackbar's state, split out of components/Snackbar.jsx
 * into its own Provider (components/SnackbarProvider.jsx) so every real
 * React caller (useQuickCheckActions.jsx/useAckLabelActions.jsx/
 * useRunScript.jsx/useBackfillActions.jsx/useTriggerAutoRun.jsx/
 * useRowCheckboxActions.jsx/useSinglePrUpdate.jsx/
 * useActivityDrawerActions.jsx/PrDataProvider.jsx - all genuine descendants
 * of SnackbarProvider, which wraps <AppRoot/> from mountAppRoot()) can call
 * showError/showWarning/hide directly via this Context instead of going
 * through the window.showErrorNotification/showWarningNotification/
 * hideErrorNotification bridge. That bridge still exists (see
 * SnackbarProvider.jsx's own comment) for index.page.js's genuinely vanilla,
 * pre-React-mount startup-failure callers - this Context is for every other,
 * already-React caller.
 *
 * Default value (unwrapped) is a safe no-op/empty-state, matching every
 * other Context in this migration.
 */
export const SnackbarContext = createContext({
  state: { visible: false, variant: 'error', message: '' },
  showError: () => {},
  showWarning: () => {},
  hide: () => {},
});

export function useSnackbar() {
  return useContext(SnackbarContext);
}
