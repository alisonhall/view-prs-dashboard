import { createContext, useContext } from 'react';

/**
 * Window-bridge elimination Phase 3c (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * the Run tab's "output" text (the `<pre id="output">` the Run script / Ack /
 * Backfill actions write their command output into). It used to be
 * `AppRoot`'s own local `useState`, reached by `useRunScript`/
 * `useSinglePrUpdate`/`useAckLabelActions`/`useBackfillActions` through
 * `window.updateReactOutputText`. Of those, `useSinglePrUpdate` runs inside
 * `PrTableApp` - not in `AppRoot`'s body - so the plan's "thread the setter
 * in as a parameter" couldn't reach it; owning the state in a Provider that
 * wraps `<AppRoot />` from `mountAppRoot()` (same as `StatusTextProvider`)
 * can reach all four, plus `AppRoot` itself, which reads `outputText` back
 * out of here to render its portal.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app.
 */
export const OutputTextContext = createContext({
  outputText: '',
  setOutputText: () => {},
});

export function useOutputText() {
  return useContext(OutputTextContext);
}

/**
 * The setter alone, in its own Context: writers (useRunScript/
 * useSinglePrUpdate/useAckLabelActions/useBackfillActions) must not subscribe
 * to the text itself. useSinglePrUpdate runs inside PrTableApp, so reading
 * `useOutputText()` there would re-render the whole table every time any
 * action writes output. The setter is a stable useState setter, so this
 * Context's value never changes for the Provider's lifetime.
 */
export const OutputTextSetterContext = createContext(() => {});

export function useSetOutputText() {
  return useContext(OutputTextSetterContext);
}
