import { useEffect, useMemo, useState } from 'react';
import { OutputTextContext } from '../state/OutputTextContext';

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
 * Still publishes `window.updateReactOutputText`, because `index.page.js`
 * (vanilla) writes the output text too and has no Context access. That one
 * remaining bridge goes away with `index.page.js` itself (Phase 7).
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

  return <OutputTextContext.Provider value={value}>{children}</OutputTextContext.Provider>;
}
