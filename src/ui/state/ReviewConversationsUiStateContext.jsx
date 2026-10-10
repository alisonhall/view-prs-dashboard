import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): which filter-mode ("All"/
 * "Unresolved"/"Resolved") and summary-cards-toggle choice a user picked
 * for a given PR's "Review conversations" section, keyed by a stable
 * per-PR key (see pr-review-conversations-ui-state.helpers.js's
 * getReviewConversationsStateKey) - replacing index.page.js's former
 * module-scope reviewConversationsUiStateByKey Map +
 * window.readReviewConversationsUiState/writeReviewConversationsUiState
 * bridges. Exists purely so a ReviewThreadsSection instance remembers its
 * own choice across its own remount (collapsing/re-expanding a row's
 * "More insights" panel resets its local useState) - nothing outside
 * ReviewThreadsSection.jsx itself ever reads or writes this.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration - a ReviewThreadsSection rendered without a
 * <ReviewConversationsUiStateProvider> ancestor still works, it just
 * never remembers its choice across a remount.
 */
export const ReviewConversationsUiStateContext = createContext({
  getReviewConversationsUiState: () => null,
  setReviewConversationsUiState: () => {},
});

export function useReviewConversationsUiState() {
  return useContext(ReviewConversationsUiStateContext);
}
