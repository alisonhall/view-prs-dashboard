import { createContext, useContext } from 'react';

/**
 * Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
 * `#status` panel's text, lifted out of AppRoot's own local `useState` so
 * hooks that can't reach AppRoot's JSX (it's their ancestor, not their
 * descendant - see StatusTextProvider.jsx's own header comment) can set it
 * directly via Context instead of bouncing through the
 * `window.updateReactStatusText`/`window.setStatusMessage` bridges.
 *
 * Default value (unwrapped) is a safe no-op shape, matching every other
 * Context in this app.
 */
export const StatusTextContext = createContext({
  statusText: 'Not run',
  setStatusText: () => {},
});

export function useStatusText() {
  return useContext(StatusTextContext);
}
