import { useCallback } from 'react';
import { useTabState } from './TabStateContext';

/**
 * Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.navigateToPrInTable - AutoRenderBlockedLinks.jsx's
 * "jump to unsaved PR" chips call this hook's returned function directly.
 *
 * The tab-switch half is a direct Context call now (`setActiveDataTab`,
 * already real React state via TabStateProvider.jsx, itself still calling
 * the real vanilla `window.activateDataTab` underneath). The "which row,
 * then scroll/focus it" half is NOT reimplemented here - PrTableApp.jsx
 * already listens for the same `pr-navigate-to-insights` CustomEvent
 * (originally added for the Author-Insights-tab "View in table" link) and
 * owns the actual DOM lookup/scroll/focus, since it's the component that
 * renders the target markup. This hook just adds a `focusUnsaved` detail
 * flag to that same event - no new wiring needed on the receiving end
 * beyond what Phase G.1 already added there.
 */
export function useNavigateToPrInTable() {
  const { setActiveDataTab } = useTabState();

  return useCallback(
    (prNumber, { focusUnsaved = false } = {}) => {
      const normalizedPrNumber = String(prNumber || '').trim();
      if (!normalizedPrNumber) {
        return false;
      }

      setActiveDataTab('pr-data');
      window.dispatchEvent(
        new CustomEvent('pr-navigate-to-insights', {
          detail: { prNumber: normalizedPrNumber, focusUnsaved },
        }),
      );
      return true;
    },
    [setActiveDataTab],
  );
}
