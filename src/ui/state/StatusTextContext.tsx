import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

/**
 * The `#status` panel's text, owned by StatusTextProvider (which wraps
 * `<AppRoot />` from `mountAppRoot()`), so hooks anywhere in the app can
 * set it - including those called from AppRoot's own body, which a
 * Provider inside AppRoot couldn't reach.
 *
 * Default value (unwrapped) is a safe no-op shape, matching every other
 * Context in this app.
 */
export interface StatusTextValue {
  statusText: string;
  setStatusText: Dispatch<SetStateAction<string>>;
}

export const StatusTextContext = createContext<StatusTextValue>({
  statusText: 'Not run',
  setStatusText: () => {},
});

export function useStatusText(): StatusTextValue {
  return useContext(StatusTextContext);
}
