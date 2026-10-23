import { useMemo, useState, type ReactNode } from 'react';
import { OutputTextContext, OutputTextSetterContext } from '../state/OutputTextContext';

/**
 * Owns the Run tab's output text. Wraps `<AppRoot />` from `mountAppRoot()`,
 * like `StatusTextProvider`, so every hook that writes it (and `AppRoot`,
 * which renders it) is a genuine descendant.
 *
 * Unlike `StatusTextProvider` this does NOT write the DOM itself:
 * `AppRoot` already renders `outputText` into `<pre id="output">` through a
 * portal, which also replaces that element's static placeholder text.
 */
export function OutputTextProvider({ children }: { children?: ReactNode }) {
  const [outputText, setOutputText] = useState('Run the script to see output');

  const value = useMemo(() => ({ outputText, setOutputText }), [outputText]);

  return (
    <OutputTextSetterContext.Provider value={setOutputText}>
      <OutputTextContext.Provider value={value}>{children}</OutputTextContext.Provider>
    </OutputTextSetterContext.Provider>
  );
}
