import { useCallback } from 'react';
import { useTabState } from './TabStateContext';

/**
 * Returns a function that shows a PR in the PR table: it switches to the
 * PR Data tab and dispatches the `pr-navigate-to-insights` event, which
 * PrTableApp.jsx handles (it finds the row, scrolls to it and focuses it,
 * since it renders that markup). Used by AutoRenderBlockedLinks.jsx's
 * "jump to unsaved PR" links (with `focusUnsaved`) and by
 * AuthorInsightsPrLink.jsx/ReviewStatsContent.jsx (with `repo`, which
 * PrTableApp uses to pick the right PR when a number exists in more than
 * one repo). Returns false for an empty PR number.
 */
export type NavigateToPrInTable = (
  prNumber: unknown,
  options?: { repo?: string; focusUnsaved?: boolean },
) => boolean;

export function useNavigateToPrInTable(): NavigateToPrInTable {
  const { setActiveDataTab } = useTabState();

  return useCallback<NavigateToPrInTable>(
    (prNumber, { repo = '', focusUnsaved = false } = {}) => {
      const normalizedPrNumber = String(prNumber || '').trim();
      if (!normalizedPrNumber) {
        return false;
      }

      setActiveDataTab('pr-data');
      window.dispatchEvent(
        new CustomEvent('pr-navigate-to-insights', {
          detail: { prNumber: normalizedPrNumber, repo, focusUnsaved },
        }),
      );
      return true;
    },
    [setActiveDataTab],
  );
}
