import { useEffect, useMemo, useState } from 'react';
import { OutputTextContext, OutputTextSetterContext } from '../state/OutputTextContext';

/**
 * Window-bridge elimination Phase 3c (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * owns the Run tab's output text. Wraps `<AppRoot />` from `mountAppRoot()`,
 * like `StatusTextProvider`, so every hook that writes it (and `AppRoot`,
 * which renders it) is a genuine descendant.
 *
 * Unlike `StatusTextProvider` this does NOT write the DOM itself:
 * `AppRoot` already renders `outputText` into `<pre id="output">` through a
 * portal, which also replaces that element's static placeholder text.
 *
 * Still publishes `window.updateReactOutputText`, but since window-bridge
 * elimination Phase 7.2 nothing in production calls it (index.page.js's
 * `setOutputMessage` lost its last callers and was deleted). Only
 * e2e/smoke.spec.js and this Provider's own unit test write through it; it's
 * on WINDOW_BRIDGE_ELIMINATION_PLAN.md's test-only list.
 */
export function OutputTextProvider({ children }) {
  const [outputText, setOutputText] = useState('Run the script to see output');

  useEffect(() => {
    window.updateReactOutputText = (text) => {
      setOutputText(text);
      return true;
    };
    return () => {
      delete window.updateReactOutputText;
    };
  }, []);

  const value = useMemo(() => ({ outputText, setOutputText }), [outputText]);

  return (
    <OutputTextSetterContext.Provider value={setOutputText}>
      <OutputTextContext.Provider value={value}>{children}</OutputTextContext.Provider>
    </OutputTextSetterContext.Provider>
  );
}
