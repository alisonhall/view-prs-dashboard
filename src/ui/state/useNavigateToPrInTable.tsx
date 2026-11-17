import { useCallback } from 'react';
import { useTabState } from './TabStateContext';

/**
 * Returns a function that shows a PR in the PR table: it switches to the
 * Pull requests view and dispatches the `pr-navigate-to-insights` event, which
 * PrTableApp.tsx handles (it finds the row, scrolls to it and focuses it,
 * since it renders that markup). Used by AutoRenderBlockedLinks'
 * "jump to unsaved PR" links (with `focusUnsaved`) and by
 * AuthorInsightsPrRow.tsx/ReviewStatsContent.tsx (with `repo`, which
 * PrTableApp uses to pick the right PR when a number exists in more than
 * one repo). Returns false for an empty PR number.
 *
 * Called from another view, it remembers where (TabStateProvider): the
 * view, the page's scroll and `from` - the button clicked, or else
 * whatever has the focus - for the table's Back button
 * (ReturnToViewBanner).
 */
export type NavigateToPrInTable = (
  prNumber: unknown,
  options?: { repo?: string; focusUnsaved?: boolean; from?: HTMLElement | null },
) => boolean;

export function useNavigateToPrInTable(): NavigateToPrInTable {
  const { activeDataTab, setActiveDataTab, rememberReturnTarget } = useTabState();

  return useCallback<NavigateToPrInTable>(
    (prNumber, { repo = '', focusUnsaved = false, from } = {}) => {
      const normalizedPrNumber = String(prNumber || '').trim();
      if (!normalizedPrNumber) {
        return false;
      }

      if (activeDataTab !== 'pr-data') {
        rememberReturnTarget({
          tab: activeDataTab,
          scrollY: window.scrollY,
          focusTarget: from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
          prNumber: normalizedPrNumber,
        });
      }
      setActiveDataTab('pr-data');
      window.dispatchEvent(
        new CustomEvent('pr-navigate-to-insights', {
          detail: { prNumber: normalizedPrNumber, repo, focusUnsaved },
        }),
      );
      return true;
    },
    [activeDataTab, setActiveDataTab, rememberReturnTarget],
  );
}
