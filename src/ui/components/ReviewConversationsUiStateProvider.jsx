import { useCallback, useMemo, useRef } from 'react';
import { ReviewConversationsUiStateContext } from '../state/ReviewConversationsUiStateContext';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the per-PR "Review
 * conversations" filter-mode/summary-cards-toggle choice, replacing
 * index.page.js's former module-scope reviewConversationsUiStateByKey Map.
 *
 * A useRef-held Map, not useState - writes don't need to trigger a
 * re-render anywhere: each ReviewThreadsSection instance already manages
 * its own re-render via its own local useState, this Provider only needs
 * to remember the value across that instance's own unmount/remount. No
 * window.* bridge is published (unlike NotesDirtyProvider) - nothing
 * outside ReviewThreadsSection.jsx ever needs to read this.
 */
export function ReviewConversationsUiStateProvider({ children }) {
  const stateByKeyRef = useRef(new Map());

  const getReviewConversationsUiState = useCallback((stateKey) => {
    return stateKey ? stateByKeyRef.current.get(stateKey) || null : null;
  }, []);

  const setReviewConversationsUiState = useCallback((stateKey, conversationFilterMode, showSummaryCards) => {
    if (!stateKey) {
      return;
    }
    stateByKeyRef.current.set(stateKey, { conversationFilterMode, showSummaryCards });
  }, []);

  const value = useMemo(
    () => ({ getReviewConversationsUiState, setReviewConversationsUiState }),
    [getReviewConversationsUiState, setReviewConversationsUiState],
  );

  return (
    <ReviewConversationsUiStateContext.Provider value={value}>
      {children}
    </ReviewConversationsUiStateContext.Provider>
  );
}
