/**
 * Snackbar - the error/warning notification bar's own markup, the whole
 * `#error-snackbar` element (its `hidden` and variant class change).
 * AppShell renders it in `#error-snackbar-root`.
 *
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * the state and the window.* bridge this used to own directly both moved
 * into SnackbarProvider.tsx (a genuine ancestor, wrapping <AppShell /> from
 * react-app.tsx) - this component is now just a reader of that Context,
 * via useSnackbar().
 *
 * @module components/Snackbar
 */

import { useSnackbar } from '../state/SnackbarContext';

export function Snackbar() {
  const { state, hide } = useSnackbar();

  return (
    <div
      id="error-snackbar"
      className={state.variant === 'warning' ? 'error-snackbar error-snackbar-warning' : 'error-snackbar'}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      hidden={!state.visible}
    >
      <div className="error-snackbar-content">
        <span id="error-snackbar-message" className="error-snackbar-message">
          {state.message}
        </span>
        <button
          type="button"
          id="error-snackbar-close"
          aria-label="Close notification"
          className="error-snackbar-close"
          onClick={() => hide()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
