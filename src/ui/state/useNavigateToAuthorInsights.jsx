import { useCallback } from 'react';
import { useTabState } from './TabStateContext';
import { usePrData } from './PrDataContext';
import { useAuthorInsights } from './AuthorInsightsContext';
import { resolveValidAuthorLogin } from '../helpers/pr-author-insights-display.helpers.js';

/**
 * Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.navigateToAuthorInsights - AutoRenderBlockedLinks.jsx's
 * "jump to unsaved author draft" chips call this hook's returned function
 * directly.
 *
 * The validation rule (resolveValidAuthorLogin), the option list
 * (useAuthorInsights().buildAuthorInsightsEntries, same pure function
 * renderAuthorInsights itself still uses vanilla-side), and the write
 * target (selectedAuthorLogin, PrDataProvider.jsx's own
 * setSelectedAuthorLogin) are all real React state/Context already - no
 * vanilla authorInsightsState mutation needed here, unlike the retired
 * vanilla version. Only the focusUnsaved DOM-node resolution is a direct
 * querySelector (same selectors vanilla used, against data attributes
 * AuthorInsightsCommentsSection.jsx already renders) - there's no
 * ref-based equivalent for "the dirty composer/edit textarea for author X"
 * anywhere yet, so this is a deliberate, scoped exception, not a bridge.
 */
export function useNavigateToAuthorInsights() {
  const { setActiveDataTab } = useTabState();
  const { payload, setSelectedAuthorLogin } = usePrData();
  const { buildAuthorInsightsEntries } = useAuthorInsights();

  return useCallback(
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
        let focusTarget = null;
        if (focusUnsaved) {
          const host = document.getElementById('author-insights');
          focusTarget =
            host?.querySelector(
              `.author-insights-comment-textarea[data-author-login="${finalAuthorLogin}"][data-draft-kind="composer"]`,
            ) ||
            host?.querySelector(
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
