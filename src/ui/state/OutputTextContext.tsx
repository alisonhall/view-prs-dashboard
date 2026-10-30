import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

/**
 * The run output text (the `<pre id="output">` in Settings › Run & check
 * that the Run script / Ack / Backfill actions write their command output
 * into). Owned by OutputTextProvider, which wraps `<AppShell />` in
 * react-app.tsx so every writer - including useSinglePrUpdate, which runs
 * inside PrTableApp - and RunCheckSection, which renders the text, are
 * descendants.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app.
 */
export type SetOutputText = Dispatch<SetStateAction<string>>;

export interface OutputTextValue {
  outputText: string;
  setOutputText: SetOutputText;
}

export const OutputTextContext = createContext<OutputTextValue>({
  outputText: '',
  setOutputText: () => {},
});

export function useOutputText(): OutputTextValue {
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
export const OutputTextSetterContext = createContext<SetOutputText>(() => {});

export function useSetOutputText(): SetOutputText {
  return useContext(OutputTextSetterContext);
}
