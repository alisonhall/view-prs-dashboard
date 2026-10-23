import { useCallback, useMemo, useRef, useState } from 'react';
import { AuthorInsightsDraftsContext, AuthorInsightsDraftsVersionContext } from '../state/AuthorInsightsDraftsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useRequestActivity } from '../state/RequestActivityContext';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.ts';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.ts';
import { postJson } from '../helpers/pr-http.helpers.ts';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the Author Insights manual-
 * comment composer/edit drafts + comments cache as real state, replacing
 * index.page.js's former module-scope authorInsightsState fields (see
 * AuthorInsightsDraftsContext.jsx's own comment for the full picture).
 *
 * A useRef-held plain object, not useState directly - reuses
 * createPrAuthorInsightsDraftsHelpers/createPrAuthorInsightsDataHelpers
 * completely unchanged (both already pure and DI'd, taking an arbitrary
 * state object as a parameter rather than closing over the vanilla
 * module-level one), the same "mutate a ref in place, force a re-render
 * via a version tick" pattern MultiSelectListPortals.jsx's own pendingTick
 * already established in this codebase - cheaper and lower-risk than
 * reimplementing this CRUD surface as a reducer over real useState.
 *
 * Phase H.15 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2): also owns saveManualComment/updateManualComment now -
 * index.page.js's own window.saveAuthorManualComment/
 * updateAuthorManualComment bridges (deleted outright) used to wrap this
 * same dataHelpers instance's saveAuthorManualComment/
 * updateAuthorManualComment with beginRequestActivity("authorComment")
 * tracking; this Provider does the identical wrapping itself, reading
 * beginRequestActivity from Context (useRequestActivity() since window-bridge
 * elimination Phase 7.3; it was usePrData() before) instead of index.page.js's
 * own module-level copy. AuthorInsightsCommentsSection.jsx calls these two
 * directly via useAuthorInsightsDrafts() now, no window.* round-trip.
 *
 * Eleventh follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
 * audit"): published only 2 of its former 12 window.* bridge names -
 * `getAuthorManualCommentsForLogin`/`getAuthorInsightsDraftsSnapshot`, for
 * index.page.js's auto-render-blocking check. Window-bridge elimination
 * Phase 7.4 moved that check into AutoRenderBlockingSync.jsx, which reads
 * this Provider's Context, and both bridges are gone (the snapshot one
 * after a spell as a test-only e2e observer). The other 10
 * (`getComposerDraft`/`updateComposerDraft`/`resetComposerDraft`/
 * `getEditDraft`/`getEditDraftMap`/`updateEditDraft`/`resetEditDraft`/
 * `setManualComments`/`getManualCommentsLoadState`/`loadManualComments`)
 * were a stale leftover: `index.page.js`'s own comment already said most
 * of them "were only ever repackaged into prAuthorInsightsDraftsHelpers,
 * which only ever fed pr-author-insights.component.js (deleted outright)",
 * and `AuthorInsightsCommentsSection.jsx` (their only real consumer) has
 * called every one of them via `useAuthorInsightsDrafts()` directly since
 * this Provider was written - a grep confirmed zero remaining `window.*`
 * references to any of the 10 outside this file's own (now rewritten)
 * tests. Every write bumps a version tick, published through
 * AuthorInsightsDraftsVersionContext (Phase 7.4; it used to drive a
 * window.recomputeDirtyPrSectionsFields?.() effect here), so
 * AutoRenderBlockingSync recomputes in its own effect, after React has
 * committed and painted the keystroke.
 */
export function AuthorInsightsDraftsProvider({ children }) {
  // Pre-initialize all 5 fields explicitly (matching index.page.js's old
  // authorInsightsState object literal exactly) - createPrAuthorInsightsDraftsHelpers
  // only normalizes 3 of these on construction (manualCommentDraftByAuthorLogin/
  // manualCommentEditDraftByAuthorLogin/manualCommentsByAuthorLogin);
  // loadAuthorManualComments (pr-author-insights-data.helpers.ts) assumes
  // manualCommentsLoadingByAuthorLogin/manualCommentsErrorByAuthorLogin
  // already exist as objects, with no existence check of its own.
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = {
      manualCommentsByAuthorLogin: {},
      manualCommentsLoadingByAuthorLogin: {},
      manualCommentsErrorByAuthorLogin: {},
      manualCommentDraftByAuthorLogin: {},
      manualCommentEditDraftByAuthorLogin: {},
    };
  }

  // Phase 7 (see REACT_MIGRATION_PLAN.md): normalizeActorLogin comes from
  // useActorIdentity() (already alias-aware, derived reactively from
  // PrDataProvider's own viewerContext.currentActorLoginAliases) rather
  // than a fresh, isolated createPrActorIdentityHelpers() call - that
  // would default to an empty alias map and silently stop resolving
  // author-login aliases this exact draft/comment data already relies on
  // via index.page.js's own real normalizeActorLogin today.
  //
  // Read through a ref, not a direct useMemo dependency - PrDataProvider
  // hands out a brand new normalizeActorLogin function every time payload
  // changes (its own viewerContext/actorIdentity useMemos both depend on
  // it), which would otherwise cascade into a new draftsHelpers/dataHelpers/
  // Context value on every unrelated payload update. Found via a real test
  // failure: AuthorInsightsCommentsSection.test.jsx's own pre-existing
  // regression test (guarding the identical class of bug for
  // AuthorInsightsProvider's sortAuthorInsightsManualCommentsDesc) caught
  // this immediately once useAuthorInsightsDrafts() was added to that
  // component's effect deps - an unrelated payload change was closing the
  // open edit form. A ref keeps every callback below stable for this
  // Provider's entire mount, exactly like NotesDirtyProvider's own
  // permanently-stable callbacks.
  // Window-bridge elimination Phase 7.3: request activity is
  // RequestActivityProvider's now, not part of usePrData().
  const { beginRequestActivity } = useRequestActivity();
  const { normalizeActorLogin } = useActorIdentity();
  const normalizeActorLoginRef = useRef(normalizeActorLogin);
  normalizeActorLoginRef.current = normalizeActorLogin;
  const normalizeActorLoginStable = useCallback(
    (...args) => normalizeActorLoginRef.current(...args),
    [],
  );

  const draftsHelpers = useMemo(
    () => createPrAuthorInsightsDraftsHelpers({ authorInsightsState: stateRef.current, normalizeActorLogin: normalizeActorLoginStable }),
    [normalizeActorLoginStable],
  );
  const dataHelpers = useMemo(
    () => createPrAuthorInsightsDataHelpers({ normalizeActorLogin: normalizeActorLoginStable, fetchFn: (...args) => fetch(...args) }),
    [normalizeActorLoginStable],
  );

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((previous) => previous + 1);
  }, []);

  // The auto-render-blocking recompute must not run synchronously inside
  // bump(): bump() is called from AuthorInsightsCommentsSection's onChange
  // handlers, in the same call stack as the textarea's own setState for the
  // keystroke, and a synchronous recompute made every keystroke visibly
  // laggy. `version` is published through AuthorInsightsDraftsVersionContext
  // instead (below), and AutoRenderBlockingSync recomputes in an effect.

  const getComposerDraft = useCallback((login) => draftsHelpers.getAuthorInsightsComposerDraft(login), [draftsHelpers]);
  const updateComposerDraft = useCallback(
    (login, nextValues) => {
      const next = draftsHelpers.updateAuthorInsightsComposerDraft(login, nextValues);
      bump();
      return next;
    },
    [draftsHelpers, bump],
  );
  const resetComposerDraft = useCallback(
    (login) => {
      draftsHelpers.resetAuthorInsightsComposerDraft(login);
      bump();
    },
    [draftsHelpers, bump],
  );
  const getEditDraft = useCallback(
    (login, comment) => draftsHelpers.getAuthorInsightsEditDraft(login, comment),
    [draftsHelpers],
  );
  const getEditDraftMap = useCallback((login) => draftsHelpers.getAuthorInsightsEditDraftMap(login), [draftsHelpers]);
  const updateEditDraft = useCallback(
    (login, commentId, nextValues) => {
      const next = draftsHelpers.updateAuthorInsightsEditDraft(login, commentId, nextValues);
      bump();
      return next;
    },
    [draftsHelpers, bump],
  );
  const resetEditDraft = useCallback(
    (login, commentId) => {
      draftsHelpers.resetAuthorInsightsEditDraft(login, commentId);
      bump();
    },
    [draftsHelpers, bump],
  );
  const getManualComments = useCallback(
    (login) => dataHelpers.getAuthorManualCommentsForLogin(login, stateRef.current),
    [dataHelpers],
  );
  const setManualComments = useCallback(
    (login, comments) => {
      const normalizedLogin = normalizeActorLoginStable(login);
      if (!normalizedLogin) {
        return;
      }
      stateRef.current.manualCommentsByAuthorLogin[normalizedLogin] = Array.isArray(comments) ? comments : [];
      bump();
    },
    [bump, normalizeActorLoginStable],
  );
  const getManualCommentsLoadState = useCallback(
    (login) => {
      const normalizedLogin = normalizeActorLoginStable(login);
      return {
        loading: Boolean(stateRef.current.manualCommentsLoadingByAuthorLogin?.[normalizedLogin]),
        error: stateRef.current.manualCommentsErrorByAuthorLogin?.[normalizedLogin] || '',
      };
    },
    [normalizeActorLoginStable],
  );
  const loadManualComments = useCallback(
    (login, onComplete) =>
      dataHelpers.loadAuthorManualComments(login, stateRef.current, () => {
        bump();
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }),
    [dataHelpers, bump],
  );
  const saveManualComment = useCallback(
    async ({ authorLogin, note, sentiment }) => {
      const finishActivity = beginRequestActivity('authorComment');
      try {
        return await dataHelpers.saveAuthorManualComment({ authorLogin, note, sentiment, postJson });
      } finally {
        finishActivity();
      }
    },
    [dataHelpers, beginRequestActivity],
  );
  const updateManualComment = useCallback(
    async (args) => {
      const finishActivity = beginRequestActivity('authorComment');
      try {
        return await dataHelpers.updateAuthorManualComment(args);
      } finally {
        finishActivity();
      }
    },
    [dataHelpers, beginRequestActivity],
  );

  // A snapshot, not individual getters - pr-auto-render-blocking.helpers.ts's
  // getBlockingAuthorInsightsLogins takes the whole
  // manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin
  // maps as one positional argument (it iterates every author's draft, not
  // just one), shaped the way the old authorInsightsState object was.
  const getDraftsSnapshot = useCallback(
    () => ({
      manualCommentDraftByAuthorLogin: stateRef.current.manualCommentDraftByAuthorLogin,
      manualCommentEditDraftByAuthorLogin: stateRef.current.manualCommentEditDraftByAuthorLogin,
    }),
    [],
  );

  // No window bridges: window.getAuthorManualCommentsForLogin went in Phase
  // 7.4 and window.getAuthorInsightsDraftsSnapshot in the test-only bridge
  // removal (AutoRenderBlockingSync and the tests use the Context).

  const value = useMemo(
    () => ({
      getComposerDraft,
      updateComposerDraft,
      resetComposerDraft,
      getEditDraft,
      getEditDraftMap,
      updateEditDraft,
      resetEditDraft,
      getManualComments,
      setManualComments,
      getManualCommentsLoadState,
      loadManualComments,
      saveManualComment,
      updateManualComment,
      getDraftsSnapshot,
    }),
    [
      getComposerDraft,
      updateComposerDraft,
      resetComposerDraft,
      getEditDraft,
      getEditDraftMap,
      updateEditDraft,
      resetEditDraft,
      getManualComments,
      setManualComments,
      getManualCommentsLoadState,
      loadManualComments,
      saveManualComment,
      updateManualComment,
      getDraftsSnapshot,
    ],
  );

  return (
    <AuthorInsightsDraftsContext.Provider value={value}>
      <AuthorInsightsDraftsVersionContext.Provider value={version}>{children}</AuthorInsightsDraftsVersionContext.Provider>
    </AuthorInsightsDraftsContext.Provider>
  );
}
