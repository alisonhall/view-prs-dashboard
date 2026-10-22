import { useMemo, useState } from 'react';
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
 * It published `window.updateReactOutputText` until the test-only bridge
 * removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): nothing in production had
 * called it since Phase 7.2 deleted index.page.js's `setOutputMessage`. e2e
 * now drives the output through a real (intercepted) "Run script" click.
 */
export function OutputTextProvider({ children }) {
  const [outputText, setOutputText] = useState('Run the script to see output');

  const value = useMemo(() => ({ outputText, setOutputText }), [outputText]);

  return (
    <OutputTextSetterContext.Provider value={setOutputText}>
      <OutputTextContext.Provider value={value}>{children}</OutputTextContext.Provider>
    </OutputTextSetterContext.Provider>
  );
}
