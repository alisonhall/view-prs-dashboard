import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthorInsightsDraftsContext } from '../state/AuthorInsightsDraftsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.js';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.js';

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
 * Publishes the same window.* bridge names index.page.js used to, now
 * backed by this Context, because 2 vanilla subsystems need to read
 * draft state from outside any single AuthorInsightsCommentsSection
 * instance's own lifetime - see AuthorInsightsDraftsContext.jsx's comment.
 * Every write bumps the version tick AND calls
 * window.recomputeDirtyPrSectionsFields?.() (same as NotesDirtyProvider's
 * own write path), since a draft change can flip the auto-render-blocking
 * decision pr-auto-render-blocking.helpers.js's getBlockingAuthorInsightsLogins
 * computes.
 */
export function AuthorInsightsDraftsProvider({ children }) {
  // Pre-initialize all 5 fields explicitly (matching index.page.js's old
  // authorInsightsState object literal exactly) - createPrAuthorInsightsDraftsHelpers
  // only normalizes 3 of these on construction (manualCommentDraftByAuthorLogin/
  // manualCommentEditDraftByAuthorLogin/manualCommentsByAuthorLogin);
  // loadAuthorManualComments (pr-author-insights-data.helpers.js) assumes
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

  const [, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((previous) => previous + 1);
    window.recomputeDirtyPrSectionsFields?.();
  }, []);

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

  // Phase 7 (see REACT_MIGRATION_PLAN.md): a dedicated read bridge, not
  // individual getters - pr-auto-render-blocking.helpers.js's
  // getBlockingAuthorInsightsLogins takes the whole
  // manualCommentDraftByAuthorLogin/manualCommentEditDraftByAuthorLogin
  // maps as one positional argument (it iterates every author's draft, not
  // just one), so index.page.js's own wiring needs a snapshot shaped the
  // same way the old authorInsightsState object was, not a per-login read.
  const getDraftsSnapshot = useCallback(
    () => ({
      manualCommentDraftByAuthorLogin: stateRef.current.manualCommentDraftByAuthorLogin,
      manualCommentEditDraftByAuthorLogin: stateRef.current.manualCommentEditDraftByAuthorLogin,
    }),
    [],
  );

  useEffect(() => {
    window.getAuthorInsightsComposerDraft = getComposerDraft;
    window.updateAuthorInsightsComposerDraft = updateComposerDraft;
    window.resetAuthorInsightsComposerDraft = resetComposerDraft;
    window.getAuthorInsightsEditDraft = getEditDraft;
    window.getAuthorInsightsEditDraftMap = getEditDraftMap;
    window.updateAuthorInsightsEditDraft = updateEditDraft;
    window.resetAuthorInsightsEditDraft = resetEditDraft;
    window.getAuthorManualCommentsForLogin = getManualComments;
    window.setAuthorInsightsManualComments = setManualComments;
    window.getAuthorInsightsManualCommentsLoadState = getManualCommentsLoadState;
    window.loadAuthorManualComments = loadManualComments;
    window.getAuthorInsightsDraftsSnapshot = getDraftsSnapshot;
    return () => {
      delete window.getAuthorInsightsComposerDraft;
      delete window.updateAuthorInsightsComposerDraft;
      delete window.resetAuthorInsightsComposerDraft;
      delete window.getAuthorInsightsEditDraft;
      delete window.getAuthorInsightsEditDraftMap;
      delete window.updateAuthorInsightsEditDraft;
      delete window.resetAuthorInsightsEditDraft;
      delete window.getAuthorManualCommentsForLogin;
      delete window.setAuthorInsightsManualComments;
      delete window.getAuthorInsightsManualCommentsLoadState;
      delete window.loadAuthorManualComments;
      delete window.getAuthorInsightsDraftsSnapshot;
    };
  }, [
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
    getDraftsSnapshot,
  ]);

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
      getDraftsSnapshot,
    ],
  );

  return <AuthorInsightsDraftsContext.Provider value={value}>{children}</AuthorInsightsDraftsContext.Provider>;
}
