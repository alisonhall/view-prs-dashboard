import { useEffect } from 'react';
import { useActorIdentity } from './ActorIdentityContext';
import { usePrData } from './PrDataContext';
import { useTabState } from './TabStateContext';

/**
 * Opening a person on the Authors view from elsewhere: the PR table's Who
 * column, the detail pane's people, Review stats' reviewers and the
 * Authors view's own "Reviewed most by".
 *
 * openAuthor only sends an event, so the table's many rows needn't follow
 * the PR data's context to offer it; OpenAuthorListener, mounted once in
 * AppShell, picks the person (by their preferred key, as the Authors
 * picker's options are), shows the Authors view and moves focus to its
 * author picker. A person who isn't among the picker's authors falls back
 * to its first, as AuthorInsightsSelector decides.
 */
export const OPEN_AUTHOR_EVENT = 'view-prs-open-author';

export interface OpenAuthorDetail {
  login: string;
  fallbackName?: string;
}

export const openAuthor = (login: unknown, fallbackName?: unknown): boolean => {
  const detail: OpenAuthorDetail = { login: String(login || '').trim(), fallbackName: String(fallbackName || '').trim() };
  if (!detail.login && !detail.fallbackName) return false;
  window.dispatchEvent(new CustomEvent<OpenAuthorDetail>(OPEN_AUTHOR_EVENT, { detail }));
  return true;
};

export function OpenAuthorListener() {
  const { setSelectedAuthorLogin } = usePrData();
  const { setActiveDataTab } = useTabState();
  const { getPreferredActorKey } = useActorIdentity();

  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = (event: Event) => {
      const { login = '', fallbackName = '' } = (event as CustomEvent<OpenAuthorDetail>).detail || {};
      const key = String(getPreferredActorKey(login, fallbackName) || '').trim();
      if (!key) return;
      setSelectedAuthorLogin(key);
      setActiveDataTab('author-insights');
      clearTimeout(focusTimer);
      // Once the view shows (it loads the first time it's opened).
      focusTimer = setTimeout(() => {
        const picker = document.getElementById('author-insights-select');
        if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0 });
        picker?.focus({ preventScroll: true });
      }, 60);
    };
    window.addEventListener(OPEN_AUTHOR_EVENT, handle);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener(OPEN_AUTHOR_EVENT, handle);
    };
  }, [getPreferredActorKey, setActiveDataTab, setSelectedAuthorLogin]);

  return null;
}
