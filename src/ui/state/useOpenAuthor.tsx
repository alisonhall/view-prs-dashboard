import { useEffect, useRef } from 'react';
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
 * author picker. Opened from another view, it remembers where from, for
 * the Back bar over Authors (ReturnToViewBanner).
 */
export const OPEN_AUTHOR_EVENT = 'view-prs-open-author';

export interface OpenAuthorDetail {
  login: string;
  fallbackName?: string;
  // The button clicked: focused again by the Back bar's Back.
  from?: HTMLElement | null;
}

// The last person opened this way ({key, name}): the Authors picker keeps
// them selected, as an option of its own, when they aren't among its
// authors (someone with no stored PR who isn't in the actors map), rather
// than quietly showing its first author instead.
let openedAuthor: { key: string; name: string } | null = null;
export const getOpenedAuthor = () => openedAuthor;

export const openAuthor = (login: unknown, fallbackName?: unknown, from?: HTMLElement | null): boolean => {
  const detail: OpenAuthorDetail = {
    login: String(login || '').trim(),
    fallbackName: String(fallbackName || '').trim(),
    ...(from ? { from } : {}),
  };
  if (!detail.login && !detail.fallbackName) return false;
  window.dispatchEvent(new CustomEvent<OpenAuthorDetail>(OPEN_AUTHOR_EVENT, { detail }));
  return true;
};

export function OpenAuthorListener() {
  const { payload, setSelectedAuthorLogin } = usePrData();
  const { activeDataTab, setActiveDataTab, rememberReturnTarget } = useTabState();
  const { getPreferredActorKey, resolveActorDisplayName } = useActorIdentity();
  // Read when an event comes, so the listener isn't added again each poll.
  const latest = useRef({ payload, activeDataTab });
  latest.current = { payload, activeDataTab };

  useEffect(() => {
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = (event: Event) => {
      const { login = '', fallbackName = '', from = null } = (event as CustomEvent<OpenAuthorDetail>).detail || {};
      const key = String(getPreferredActorKey(login, fallbackName) || '').trim();
      if (!key) return;
      // From another view: a Back bar over Authors returns to it, scrolled
      // and focused as it was left.
      const { payload: currentPayload, activeDataTab: fromTab } = latest.current;
      if (fromTab !== 'author-insights') {
        rememberReturnTarget({
          tab: fromTab,
          scrollY: window.scrollY,
          focusTarget: from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
          prNumber: '',
          shownIn: 'author-insights',
          subject: resolveActorDisplayName(key, currentPayload?.actorsMap || {}, fallbackName) || fallbackName || key,
        });
      }
      openedAuthor = {
        key,
        name: resolveActorDisplayName(key, currentPayload?.actorsMap || {}, fallbackName) || fallbackName || key,
      };
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
  }, [getPreferredActorKey, resolveActorDisplayName, rememberReturnTarget, setActiveDataTab, setSelectedAuthorLogin]);

  return null;
}
