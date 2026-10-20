import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the Author Insights tab's manual-
 * comment composer/edit drafts and comments cache, replacing
 * index.page.js's former module-scope `authorInsightsState` fields
 * (manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin/
 * manualCommentsByAuthorLogin/manualCommentsLoadingByAuthorLogin/
 * manualCommentsErrorByAuthorLogin).
 *
 * Owned by AuthorInsightsDraftsProvider.jsx. Eleventh follow-up (see
 * REACT_MIGRATION_PLAN.md, "Remaining-effort audit"): of this Context's
 * original 12 window.* bridge names, only `getAuthorManualCommentsForLogin`/
 * `getAuthorInsightsDraftsSnapshot` still get published - `index.page.js`'s
 * fully-vanilla `getBlockingAuthorInsightsLogins` (feeds the real auto-
 * render-blocking/data-loss-prevention check) still needs to read "is
 * there an unsaved author-comment draft" from outside any single
 * AuthorInsightsCommentsSection instance's own lifetime. The other 10 were
 * a stale leftover - AuthorInsightsCommentsSection.jsx (their only real
 * consumer) already calls every one of them via useAuthorInsightsDrafts()
 * directly, confirmed by grep to have zero remaining window.* callers.
 *
 * getDraftsSnapshot (Phase G.2) is the one bridge whose Context-exposed
 * form and window-bridge form both stay, for the same reason: a future
 * real React consumer can read it reactively via useAuthorInsightsDrafts(),
 * while getBlockingAuthorInsightsLogins's own caller stays vanilla.
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
