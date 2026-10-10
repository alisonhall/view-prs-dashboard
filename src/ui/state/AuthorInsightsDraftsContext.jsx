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
 * same 11 bridge names (now backed by this Context) because 2 vanilla
 * subsystems need to read "is there an unsaved author-comment draft" from
 * outside any single AuthorInsightsCommentsSection instance's own
 * lifetime: pr-auto-render-blocking.helpers.js's
 * getBlockingAuthorInsightsLogins (feeds the real auto-render-blocking/
 * data-loss-prevention check) and pr-auto-render-navigation.helpers.js's
 * getFirstDirtyAuthorInsightsElement (the "jump to unsaved draft" chip).
 * Converting those 2 vanilla subsystems themselves is a separate, later
 * step - not this one.
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
});

export function useAuthorInsightsDrafts() {
  return useContext(AuthorInsightsDraftsContext);
}
