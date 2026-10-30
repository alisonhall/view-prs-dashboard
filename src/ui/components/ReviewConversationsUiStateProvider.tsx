import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  ReviewConversationsUiStateContext,
  type ReviewConversationsUiStateValue,
  type SavedReviewConversationsUiState,
} from '../state/ReviewConversationsUiStateContext';

/**
 * Owns the per-PR Conversations tab filter choice.
 *
 * A useRef-held Map, not useState - writes don't need to trigger a
 * re-render anywhere: the tab manages its own re-render with local
 * useState; this Provider only remembers the value across the tab's
 * unmount/remount (another PR, another tab).
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
    (stateKey, conversationFilterMode) => {
      if (!stateKey) {
        return;
      }
      stateByKeyRef.current.set(stateKey, { conversationFilterMode });
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
