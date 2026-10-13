import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the Author Insights tab's manual-
 * comment composer/edit drafts and comments cache, replacing
 * index.page.js's former module-scope `authorInsightsState` fields
 * (manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin/
 * manualCommentsByAuthorLogin/manualCommentsLoadingByAuthorLogin/
 * manualCommentsErrorByAuthorLogin) + their 11 window.* bridges.
 *
 * Owned by AuthorInsightsDraftsProvider.jsx, which still publishes those
 * same 11 bridge names (now backed by this Context) because
 * pr-auto-render-blocking.helpers.js's getBlockingAuthorInsightsLogins
 * (feeds the real auto-render-blocking/data-loss-prevention check) needs
 * to read "is there an unsaved author-comment draft" from outside any
 * single AuthorInsightsCommentsSection instance's own lifetime, and is
 * itself fully vanilla with no render-tree position. Converting that
 * subsystem is a separate, later step - not this one.
 *
 * Phase G.2 (see REACT_MIGRATION_PLAN.md): also exposes getDraftsSnapshot,
 * the same snapshot the window.getAuthorInsightsDraftsSnapshot bridge
 * already returns, so a future real React consumer can read the dirty-
 * draft maps reactively via useAuthorInsightsDrafts() instead of reaching
 * through window - the bridge itself stays, since
 * getBlockingAuthorInsightsLogins's own caller is vanilla and out of
 * scope here.
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
