/**
 * Snackbar - the error/warning notification bar's own markup. Mounted into
 * an empty `#error-snackbar-root` (index.html), not a portal into a
 * pre-existing `#error-snackbar` element - this component owns the *entire*
 * subtree, including the outer element's own `id="error-snackbar"`/
 * `hidden`/variant class, none of which a portal into an existing element's
 * children could toggle.
 *
 * Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
 * the state and the window.* bridge this used to own directly both moved
 * into SnackbarProvider.tsx (a genuine ancestor, wrapping <AppRoot/> from
 * mountAppRoot()) - this component is now just a reader of that Context,
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
