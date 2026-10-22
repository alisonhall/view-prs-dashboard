import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the Author Insights tab's manual-
 * comment composer/edit drafts and comments cache, replacing
 * index.page.js's former module-scope `authorInsightsState` fields
 * (manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin/
 * manualCommentsByAuthorLogin/manualCommentsLoadingByAuthorLogin/
 * manualCommentsErrorByAuthorLogin).
 *
 * Owned by AuthorInsightsDraftsProvider.jsx. Window-bridge elimination
 * Phase 7.4: AutoRenderBlockingSync.jsx reads getDraftsSnapshot/
 * getManualComments from here to compute the auto-render-blocking state
 * (index.page.js used to, through window.getAuthorInsightsDraftsSnapshot/
 * getAuthorManualCommentsForLogin). Neither is published any more.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration - AuthorInsightsCommentsSection rendered without a
 * <AuthorInsightsDraftsProvider> ancestor still works, it just never
 * persists a draft across its own remount.
 */
const noopDraft = () => ({ note: '', sentiment: 'neutral' });

export const AuthorInsightsDraftsContext = createContext({
  getComposerDraft: noopDraft,
  updateComposerDraft: noopDraft,
  resetComposerDraft: () => {},
  getEditDraft: (_login, comment) => ({
    note: String(comment?.note || ''),
    sentiment: comment?.sentiment || 'neutral',
    isEditing: false,
  }),
  getEditDraftMap: () => ({}),
  updateEditDraft: () => null,
  resetEditDraft: () => {},
  getManualComments: () => [],
  setManualComments: () => {},
  getManualCommentsLoadState: () => ({ loading: false, error: '' }),
  loadManualComments: () => {},
  getDraftsSnapshot: () => ({
    manualCommentDraftByAuthorLogin: {},
    manualCommentEditDraftByAuthorLogin: {},
  }),
});

export function useAuthorInsightsDrafts() {
  return useContext(AuthorInsightsDraftsContext);
}

/**
 * Window-bridge elimination Phase 7.4: the Provider's write counter, bumped on
 * every draft/comment-cache change. A separate Context so only the one
 * component that needs to react to every change (AutoRenderBlockingSync)
 * re-renders on each keystroke - the Context above stays stable.
 */
export const AuthorInsightsDraftsVersionContext = createContext(0);

export function useAuthorInsightsDraftsVersion() {
  return useContext(AuthorInsightsDraftsVersionContext);
}
