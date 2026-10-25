import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  SnackbarContext,
  type ShowSnackbar,
  type SnackbarState,
  type SnackbarVariant,
} from '../state/SnackbarContext';

/**
 * Owns the error/warning snackbar's state, wrapping <AppRoot/> from
 * mountAppRoot() (react-app.jsx) - like StatusTextProvider and
 * PrActivityQueueProvider - because several hooks that AppRoot's own body
 * (or a descendant like PrTableApp.tsx) calls need a genuine Context
 * ancestor for useSnackbar() to resolve to anything other than the no-op
 * default.
 *
 * flushSync, not a plain setState: every caller triggers this from outside
 * a synchronous React event handler (an async fetch .then/.catch, a
 * setTimeout poll callback), so React 18 won't flush the update on its own
 * - several existing tests read document.getElementById(...) immediately
 * after calling one of these and need to see the committed result.
 */
export function SnackbarProvider({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<SnackbarState>({ visible: false, variant: 'error', message: '' });
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(
    (variant: SnackbarVariant, title: string, message: string | undefined, autoDismissMs: number) => {
      clearTimeout(dismissTimeoutRef.current);
      const fullMessage = message ? `${title}\n\n${message}` : title;
      flushSync(() => setState({ visible: true, variant, message: fullMessage }));
      if (autoDismissMs > 0) {
        dismissTimeoutRef.current = setTimeout(() => {
          flushSync(() => setState((previous) => ({ ...previous, visible: false })));
        }, autoDismissMs);
      }
    },
    [],
  );

  const showError = useCallback<ShowSnackbar>(
    (title, message, autoDismissMs = 8000) => show('error', title, message, autoDismissMs),
    [show],
  );
  const showWarning = useCallback<ShowSnackbar>(
    (title, message, autoDismissMs = 12000) => show('warning', title, message, autoDismissMs),
    [show],
  );
  const hide = useCallback(() => {
    clearTimeout(dismissTimeoutRef.current);
    flushSync(() => setState((previous) => ({ ...previous, visible: false })));
  }, []);

  // A pending auto-dismiss must not fire after unmount.
  useEffect(() => () => clearTimeout(dismissTimeoutRef.current), []);

  const value = useMemo(
    () => ({ state, showError, showWarning, hide }),
    [state, showError, showWarning, hide],
  );

  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>;
}
