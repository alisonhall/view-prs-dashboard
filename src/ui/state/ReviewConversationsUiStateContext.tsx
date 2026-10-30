import { createContext, useContext } from 'react';
import type { ConversationFilterMode } from '../helpers/pr-review-conversations-ui-state.helpers.ts';

/**
 * Which filter ("Unresolved" / "Waiting on me" / "All") the user picked on
 * a given PR's Conversations tab, keyed by a stable per-PR key (see
 * pr-review-conversations-ui-state.helpers.ts's
 * getReviewConversationsStateKey). The detail pane gives each PR fresh tab
 * content, so this is what remembers the choice when you come back to a
 * PR - nothing outside the Conversations tab reads or writes it.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - the tab rendered without a
 * <ReviewConversationsUiStateProvider> ancestor still works, it just never
 * remembers its choice.
 */
export interface SavedReviewConversationsUiState {
  conversationFilterMode: ConversationFilterMode;
}

export interface ReviewConversationsUiStateValue {
  getReviewConversationsUiState: (stateKey: string) => SavedReviewConversationsUiState | null;
  setReviewConversationsUiState: (stateKey: string, conversationFilterMode: ConversationFilterMode) => void;
}

export const ReviewConversationsUiStateContext = createContext<ReviewConversationsUiStateValue>({
  getReviewConversationsUiState: () => null,
  setReviewConversationsUiState: () => {},
});

export function useReviewConversationsUiState(): ReviewConversationsUiStateValue {
  return useContext(ReviewConversationsUiStateContext);
}
