/**
 * Snackbar - React-owned error/warning notification bar, replacing
 * index.page.js's showErrorNotification/showWarningNotification/
 * hideErrorNotification (deferred-items follow-up, full vanilla-to-React
 * sweep - see REACT_MIGRATION_PLAN.md).
 *
 * Mounted into an empty `#error-snackbar-root` (index.html), not a portal
 * into a pre-existing `#error-snackbar` element - this component owns the
 * *entire* subtree, including the outer element's own `id="error-snackbar"`/
 * `hidden`/variant class, none of which a portal into an existing element's
 * children could toggle. index.page.js's own showErrorNotification/
 * showWarningNotification/hideErrorNotification become thin delegating
 * wrappers around the window.* bridges this component registers, so their
 * ~15+ existing call sites (notifyFailureSnackbar, markPollSuccess, etc.)
 * keep working unmodified.
 *
 * flushSync, not a plain setState: matching react-app.jsx's own
 * renderReactMultiSelectList (see its comment) - these bridges are called
 * from vanilla code outside any React event handler (poll failure
 * handlers, fetch rejections), so React 18 won't synchronously flush the
 * update on its own; a caller reading document.getElementById(...) right
 * after calling one of these (several existing tests do exactly this)
 * must see the committed result, not a deferred one.
 *
 * @module components/Snackbar
 */

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export function Snackbar() {
  const [state, setState] = useState({ visible: false, variant: 'error', message: '' });
  const dismissTimeoutRef = useRef(null);

  useEffect(() => {
    const show = (variant, title, message, autoDismissMs) => {
      clearTimeout(dismissTimeoutRef.current);
      const fullMessage = message ? `${title}\n\n${message}` : title;
      flushSync(() => setState({ visible: true, variant, message: fullMessage }));
      if (autoDismissMs > 0) {
        dismissTimeoutRef.current = setTimeout(() => {
          flushSync(() => setState((previous) => ({ ...previous, visible: false })));
        }, autoDismissMs);
      }
    };

    const hide = () => {
      clearTimeout(dismissTimeoutRef.current);
      flushSync(() => setState((previous) => ({ ...previous, visible: false })));
    };

    window.showErrorNotification = (title, message, autoDismissMs = 8000) =>
      show('error', title, message, autoDismissMs);
    window.showWarningNotification = (title, message, autoDismissMs = 12000) =>
      show('warning', title, message, autoDismissMs);
    window.hideErrorNotification = hide;

    return () => {
      clearTimeout(dismissTimeoutRef.current);
      delete window.showErrorNotification;
      delete window.showWarningNotification;
      delete window.hideErrorNotification;
    };
  }, []);

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
          onClick={() => window.hideErrorNotification?.()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
