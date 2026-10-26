import { useCallback } from 'react';
import { useTabState } from './TabStateContext';
import { usePrData } from './PrDataContext';
import { useAuthorInsights } from './AuthorInsightsContext';
import { resolveValidAuthorLogin } from '../helpers/pr-author-insights-display.helpers.ts';

/**
 * Returns a function that opens an author on the Author Insights tab: it
 * switches tabs, selects the author (the requested login, or the first
 * author option when that login isn't one - resolveValidAuthorLogin),
 * then focuses the author dropdown, or with `focusUnsaved` that author's
 * comment textarea. Used by
 * AutoRenderBlockedLinks' "jump to unsaved author draft" links (the app
 * header's auto-update-paused banner).
 * Returns false for an empty login.
 *
 * The textarea is found with querySelector against the data attributes
 * AuthorInsightsCommentsSection.jsx renders; there is no ref for "the
 * dirty textarea for author X".
 */
export type NavigateToAuthorInsights = (authorLogin: unknown, options?: { focusUnsaved?: boolean }) => boolean;

export function useNavigateToAuthorInsights(): NavigateToAuthorInsights {
  const { setActiveDataTab } = useTabState();
  const { payload, setSelectedAuthorLogin } = usePrData();
  const { buildAuthorInsightsEntries } = useAuthorInsights();

  return useCallback<NavigateToAuthorInsights>(
    (authorLogin, { focusUnsaved = false } = {}) => {
      const requestedLogin = String(authorLogin || '').trim();
      if (!requestedLogin) {
        return false;
      }

      setActiveDataTab('author-insights');

      const rows = Object.values(payload?.byPrNumber || {});
      const actorsMap = payload?.actorsMap || {};
      const authorOptions = rows.length ? buildAuthorInsightsEntries(rows, actorsMap) : [];
      const finalAuthorLogin = authorOptions.length
        ? resolveValidAuthorLogin(authorOptions, requestedLogin)
        : requestedLogin;
      setSelectedAuthorLogin(finalAuthorLogin);

      setTimeout(() => {
        let focusTarget: HTMLElement | null = null;
        if (focusUnsaved) {
          const host = document.getElementById('author-insights');
          focusTarget =
            host?.querySelector<HTMLElement>(
              `.author-insights-comment-textarea[data-author-login="${finalAuthorLogin}"][data-draft-kind="composer"]`,
            ) ||
            host?.querySelector<HTMLElement>(
              `.author-insights-comment-textarea[data-author-login="${finalAuthorLogin}"]`,
            ) ||
            null;
        }
        if (!focusTarget) {
          focusTarget = document.getElementById('author-insights-select');
        }
        if (!focusTarget) {
          return;
        }
        if (typeof focusTarget.scrollIntoView === 'function') {
          focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        }
      }, 30);

      return true;
    },
    [setActiveDataTab, payload, setSelectedAuthorLogin, buildAuthorInsightsEntries],
  );
}
