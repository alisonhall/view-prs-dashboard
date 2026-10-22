import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SnackbarContext } from '../state/SnackbarContext';

/**
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * owns the error/warning snackbar's state as real React state, wrapping
 * <AppRoot/> from mountAppRoot() (react-app.jsx) - same "wrap from the
 * root-mount call, not from inside AppRoot's own returned JSX" shape as
 * StatusTextProvider/BackfillStatusProvider/PrActivityQueueProvider, for
 * the identical reason: several hooks that AppRoot's own body (or a
 * descendant like PrTableApp.jsx) calls need a genuine Context ancestor to
 * resolve useSnackbar() to anything other than this Context's own no-op
 * default.
 *
 * Every caller reads showError/showWarning/hide from this Context. The
 * window.showErrorNotification/showWarningNotification/hideErrorNotification
 * bridges it used to publish are deleted (test-only bridge removal, see
 * WINDOW_BRIDGE_ELIMINATION_PLAN.md): window-bridge elimination Phase 7
 * removed their last production caller, and e2e's Snackbar test now
 * triggers real failures instead.
 *
 * flushSync, not a plain setState - unchanged from the original
 * Snackbar.jsx's own reasoning (matching react-app.jsx's own
 * renderReactMultiSelectList): every caller triggers this from outside a
 * synchronous React event handler (an async
 * fetch .then/.catch, a setTimeout poll callback), so React 18 won't flush
 * the update on its own - several existing tests read
 * document.getElementById(...) immediately after calling one of these and
 * need to see the committed result.
 */
export function SnackbarProvider({ children }) {
  const [state, setState] = useState({ visible: false, variant: 'error', message: '' });
  const dismissTimeoutRef = useRef(null);

  const show = useCallback((variant, title, message, autoDismissMs) => {
    clearTimeout(dismissTimeoutRef.current);
    const fullMessage = message ? `${title}\n\n${message}` : title;
    flushSync(() => setState({ visible: true, variant, message: fullMessage }));
    if (autoDismissMs > 0) {
      dismissTimeoutRef.current = setTimeout(() => {
        flushSync(() => setState((previous) => ({ ...previous, visible: false })));
      }, autoDismissMs);
    }
  }, []);

  const showError = useCallback(
    (title, message, autoDismissMs = 8000) => show('error', title, message, autoDismissMs),
    [show],
  );
  const showWarning = useCallback(
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
