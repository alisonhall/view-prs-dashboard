import { createContext, useContext } from 'react';
import type { ConversationFilterMode } from '../helpers/pr-review-conversations-ui-state.helpers.ts';

/**
 * Which filter mode ("All"/"Unresolved"/"Resolved") and summary-cards
 * toggle a user picked for a given PR's "Review conversations" section,
 * keyed by a stable per-PR key (see
 * pr-review-conversations-ui-state.helpers.ts's
 * getReviewConversationsStateKey). Exists purely so a ReviewThreadsSection
 * instance remembers its own choice across its own remount (collapsing/
 * re-expanding a row's "More insights" panel resets its local useState) -
 * nothing outside ReviewThreadsSection.jsx ever reads or writes this.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - a ReviewThreadsSection rendered without a
 * <ReviewConversationsUiStateProvider> ancestor still works, it just never
 * remembers its choice across a remount.
 */
export interface SavedReviewConversationsUiState {
  conversationFilterMode: ConversationFilterMode;
  showSummaryCards: boolean;
}

export interface ReviewConversationsUiStateValue {
  getReviewConversationsUiState: (stateKey: string) => SavedReviewConversationsUiState | null;
  setReviewConversationsUiState: (
    stateKey: string,
    conversationFilterMode: ConversationFilterMode,
    showSummaryCards: boolean,
  ) => void;
}

export const ReviewConversationsUiStateContext = createContext<ReviewConversationsUiStateValue>({
  getReviewConversationsUiState: () => null,
  setReviewConversationsUiState: () => {},
});

export function useReviewConversationsUiState(): ReviewConversationsUiStateValue {
  return useContext(ReviewConversationsUiStateContext);
}
