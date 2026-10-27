import { useMemo, useState, type ReactNode } from 'react';
import { OutputTextContext, OutputTextSetterContext } from '../state/OutputTextContext';

/**
 * Owns the run output text. Wraps `<AppShell />` in react-app.tsx, like
 * `StatusTextProvider`, so every hook that writes it, and the Settings
 * drawer's RunCheckSection, which renders it into `<pre id="output">`,
 * are genuine descendants.
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
