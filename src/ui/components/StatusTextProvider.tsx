import { useMemo, useState, type ReactNode } from 'react';
import { INITIAL_STATUS_TEXT, StatusTextContext } from '../state/StatusTextContext';

/**
 * Owns the status message's text: the latest action's result or progress.
 * The app header shows its first line once something has reported (so it's
 * seen), and the Settings drawer's Run & check shows it whole (`#status`,
 * RunCheckSection).
 *
 * Mounted wrapping `<AppShell />` in react-app.tsx, outside AppShell's
 * own returned JSX - same reasoning as `PrActivityQueueProvider`:
 * `useRunScript`/`useBackfillActions`/`useAckLabelActions`/
 * `useSinglePrUpdate` are called from AppShell's descendants, and
 * `useQuickCheckActions` from AppShell's own body, so a Provider nested
 * *inside* AppShell's returned tree
 * could never be reached by a caller sitting in AppShell's own body (a
 * component can't be a descendant of something it renders). Wrapping from
 * the root-mount call instead makes every one of those a genuine Context
 * descendant.
 *
 * It used to write `#status`'s `textContent` itself, while the integration
 * harness mounted several of these; there's one now, and the drawer
 * renders the text (UI redesign phase 9b).
 */
export function StatusTextProvider({ children }: { children?: ReactNode }) {
  const [statusText, setStatusText] = useState(INITIAL_STATUS_TEXT);
  const value = useMemo(() => ({ statusText, setStatusText }), [statusText]);
  return <StatusTextContext.Provider value={value}>{children}</StatusTextContext.Provider>;
}
