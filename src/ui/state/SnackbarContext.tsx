import { createContext, useContext } from 'react';

/**
 * The error/warning snackbar's state and actions, owned by
 * SnackbarProvider (which wraps `<AppRoot/>` from `mountAppRoot()`). Every
 * caller that reports a failure - the action hooks, PrDataProvider,
 * useActivityDrawerActions - calls showError/showWarning/hide from here.
 *
 * Default value (unwrapped) is a safe no-op/empty state, matching every
 * other Context in this app.
 */
export type SnackbarVariant = 'error' | 'warning';

export interface SnackbarState {
  visible: boolean;
  variant: SnackbarVariant;
  message: string;
}

// title, optional detail, and how long until it hides itself (0 = stays).
export type ShowSnackbar = (title: string, message?: string, autoDismissMs?: number) => void;

export interface SnackbarValue {
  state: SnackbarState;
  showError: ShowSnackbar;
  showWarning: ShowSnackbar;
  hide: () => void;
}

export const SnackbarContext = createContext<SnackbarValue>({
  state: { visible: false, variant: 'error', message: '' },
  showError: () => {},
  showWarning: () => {},
  hide: () => {},
});

export function useSnackbar(): SnackbarValue {
  return useContext(SnackbarContext);
}
