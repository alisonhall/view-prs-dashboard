import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  ReviewConversationsUiStateContext,
  type ReviewConversationsUiStateValue,
  type SavedReviewConversationsUiState,
} from '../state/ReviewConversationsUiStateContext';

/**
 * Owns the per-PR "Review conversations" filter-mode/summary-cards-toggle
 * choice.
 *
 * A useRef-held Map, not useState - writes don't need to trigger a
 * re-render anywhere: each ReviewThreadsSection instance already manages
 * its own re-render via its own local useState, this Provider only needs
 * to remember the value across that instance's own unmount/remount.
 */
export function ReviewConversationsUiStateProvider({ children }: { children?: ReactNode }) {
  const stateByKeyRef = useRef(new Map<string, SavedReviewConversationsUiState>());

  const getReviewConversationsUiState = useCallback<ReviewConversationsUiStateValue['getReviewConversationsUiState']>(
    (stateKey) => {
      return stateKey ? stateByKeyRef.current.get(stateKey) || null : null;
    },
    [],
  );

  const setReviewConversationsUiState = useCallback<ReviewConversationsUiStateValue['setReviewConversationsUiState']>(
    (stateKey, conversationFilterMode, showSummaryCards) => {
      if (!stateKey) {
        return;
      }
      stateByKeyRef.current.set(stateKey, { conversationFilterMode, showSummaryCards });
    },
    [],
  );

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
