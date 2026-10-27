import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

/**
 * The `#status` panel's text, owned by StatusTextProvider (which wraps
 * `<AppShell />` in react-app.tsx), so hooks anywhere in the app can
 * set it - including those called from AppShell's own body, which a
 * Provider inside AppShell couldn't reach.
 *
 * Default value (unwrapped) is a safe no-op shape, matching every other
 * Context in this app.
 */
export interface StatusTextValue {
  statusText: string;
  setStatusText: Dispatch<SetStateAction<string>>;
}

// The text before anything has reported (the app header shows nothing then).
export const INITIAL_STATUS_TEXT = 'Not run';

export const StatusTextContext = createContext<StatusTextValue>({
  statusText: INITIAL_STATUS_TEXT,
  setStatusText: () => {},
});

export function useStatusText(): StatusTextValue {
  return useContext(StatusTextContext);
}
