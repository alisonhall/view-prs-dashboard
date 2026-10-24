import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AuthorInsightsDraftsContext,
  AuthorInsightsDraftsVersionContext,
  type AuthorCommentsResponse,
  type AuthorInsightsDraftsValue,
} from '../state/AuthorInsightsDraftsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useRequestActivity } from '../state/RequestActivityContext';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.ts';
import {
  createPrAuthorInsightsDataHelpers,
  type AuthorInsightsState,
} from '../helpers/pr-author-insights-data.helpers.ts';
import { postJson } from '../helpers/pr-http.helpers.ts';

// Every map present (see the stateRef comment below).
type DraftsProviderState = Required<AuthorInsightsState>;

/**
 * Owns the Author Insights manual-comment composer/edit drafts and comments
 * cache (see AuthorInsightsDraftsContext.tsx), plus saveManualComment/
 * updateManualComment, which wrap the data helpers' save/update with
 * beginRequestActivity('authorComment') tracking. It publishes no window
 * bridges.
 *
 * The state is a useRef-held plain object, not useState: it reuses
 * createPrAuthorInsightsDraftsHelpers/createPrAuthorInsightsDataHelpers
 * unchanged (both take the state object as a parameter and mutate it), with
 * a version tick to re-render - the same pattern as
 * MultiSelectListPortals.jsx's pendingTick, and cheaper than reimplementing
 * this CRUD surface as a reducer. The tick is published through
 * AuthorInsightsDraftsVersionContext, so AutoRenderBlockingSync recomputes
 * in its own effect, after React has committed the keystroke.
 */
export function AuthorInsightsDraftsProvider({ children }: { children?: ReactNode }) {
  // Pre-initialize all 5 fields explicitly - createPrAuthorInsightsDraftsHelpers
  // only normalizes 3 of these on construction (manualCommentDraftByAuthorLogin/
  // manualCommentEditDraftByAuthorLogin/manualCommentsByAuthorLogin);
  // loadAuthorManualComments (pr-author-insights-data.helpers.ts) assumes
  // manualCommentsLoadingByAuthorLogin/manualCommentsErrorByAuthorLogin
  // already exist as objects, with no existence check of its own.
  const stateRef = useRef<DraftsProviderState | null>(null);
  if (!stateRef.current) {
    stateRef.current = {
      manualCommentsByAuthorLogin: {},
      manualCommentsLoadingByAuthorLogin: {},
      manualCommentsErrorByAuthorLogin: {},
      manualCommentDraftByAuthorLogin: {},
      manualCommentEditDraftByAuthorLogin: {},
    };
  }
  // Set just above and never replaced.
  const state = stateRef.current;

  // normalizeActorLogin comes from useActorIdentity() (alias-aware, from
  // PrDataProvider's viewerContext.currentActorLoginAliases), not a fresh
  // createPrActorIdentityHelpers() call, which would have an empty alias
  // map and stop resolving author-login aliases.
  //
  // Read through a ref, not a useMemo dependency: PrDataProvider hands out
  // a new normalizeActorLogin every time payload changes, which would
  // otherwise cascade into a new helpers/Context value on every unrelated
  // payload update - and AuthorInsightsCommentsSection's effect depends on
  // this Context, so an unrelated poll closed an open edit form (caught by
  // AuthorInsightsCommentsSection.test.jsx's regression test). The ref
  // keeps every callback below stable for this Provider's whole mount.
  const { beginRequestActivity } = useRequestActivity();
  const { normalizeActorLogin } = useActorIdentity();
  const normalizeActorLoginRef = useRef(normalizeActorLogin);
  normalizeActorLoginRef.current = normalizeActorLogin;
  const normalizeActorLoginStable = useCallback((value: unknown) => normalizeActorLoginRef.current(value), []);

  const draftsHelpers = useMemo(
    () => createPrAuthorInsightsDraftsHelpers({ authorInsightsState: state, normalizeActorLogin: normalizeActorLoginStable }),
    [state, normalizeActorLoginStable],
  );
  const dataHelpers = useMemo(
    () =>
      createPrAuthorInsightsDataHelpers({
        normalizeActorLogin: normalizeActorLoginStable,
        fetchFn: (input, init) => fetch(input, init),
      }),
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

  const getComposerDraft = useCallback<AuthorInsightsDraftsValue['getComposerDraft']>(
    (login) => draftsHelpers.getAuthorInsightsComposerDraft(login),
    [draftsHelpers],
  );
  const updateComposerDraft = useCallback<AuthorInsightsDraftsValue['updateComposerDraft']>(
    (login, nextValues) => {
      const next = draftsHelpers.updateAuthorInsightsComposerDraft(login, nextValues);
      bump();
      return next;
    },
    [draftsHelpers, bump],
  );
  const resetComposerDraft = useCallback<AuthorInsightsDraftsValue['resetComposerDraft']>(
    (login) => {
      draftsHelpers.resetAuthorInsightsComposerDraft(login);
      bump();
    },
    [draftsHelpers, bump],
  );
  const getEditDraft = useCallback<AuthorInsightsDraftsValue['getEditDraft']>(
    (login, comment) => draftsHelpers.getAuthorInsightsEditDraft(login, comment),
    [draftsHelpers],
  );
  const getEditDraftMap = useCallback<AuthorInsightsDraftsValue['getEditDraftMap']>(
    (login) => draftsHelpers.getAuthorInsightsEditDraftMap(login),
    [draftsHelpers],
  );
  const updateEditDraft = useCallback<AuthorInsightsDraftsValue['updateEditDraft']>(
    (login, commentId, nextValues) => {
      const next = draftsHelpers.updateAuthorInsightsEditDraft(login, commentId, nextValues);
      bump();
      return next;
    },
    [draftsHelpers, bump],
  );
  const resetEditDraft = useCallback<AuthorInsightsDraftsValue['resetEditDraft']>(
    (login, commentId) => {
      draftsHelpers.resetAuthorInsightsEditDraft(login, commentId);
      bump();
    },
    [draftsHelpers, bump],
  );
  const getManualComments = useCallback<AuthorInsightsDraftsValue['getManualComments']>(
    (login) => dataHelpers.getAuthorManualCommentsForLogin(login, state),
    [state, dataHelpers],
  );
  const setManualComments = useCallback<AuthorInsightsDraftsValue['setManualComments']>(
    (login, comments) => {
      const normalizedLogin = normalizeActorLoginStable(login);
      if (!normalizedLogin) {
        return;
      }
      state.manualCommentsByAuthorLogin[normalizedLogin] = Array.isArray(comments) ? comments : [];
      bump();
    },
    [state, bump, normalizeActorLoginStable],
  );
  const getManualCommentsLoadState = useCallback<AuthorInsightsDraftsValue['getManualCommentsLoadState']>(
    (login) => {
      const normalizedLogin = normalizeActorLoginStable(login);
      return {
        loading: Boolean(state.manualCommentsLoadingByAuthorLogin?.[normalizedLogin]),
        error: state.manualCommentsErrorByAuthorLogin?.[normalizedLogin] || '',
      };
    },
    [state, normalizeActorLoginStable],
  );
  const loadManualComments = useCallback<AuthorInsightsDraftsValue['loadManualComments']>(
    (login, onComplete) =>
      dataHelpers.loadAuthorManualComments(login, state, () => {
        bump();
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }),
    [state, dataHelpers, bump],
  );
  const saveManualComment = useCallback<AuthorInsightsDraftsValue['saveManualComment']>(
    async ({ authorLogin, note, sentiment }) => {
      const finishActivity = beginRequestActivity('authorComment');
      try {
        return await dataHelpers.saveAuthorManualComment<AuthorCommentsResponse>({ authorLogin, note, sentiment, postJson });
      } finally {
        finishActivity();
      }
    },
    [dataHelpers, beginRequestActivity],
  );
  const updateManualComment = useCallback<AuthorInsightsDraftsValue['updateManualComment']>(
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
  // maps as one argument (it iterates every author's draft, not just one).
  const getDraftsSnapshot = useCallback<AuthorInsightsDraftsValue['getDraftsSnapshot']>(
    () => ({
      manualCommentDraftByAuthorLogin: state.manualCommentDraftByAuthorLogin,
      manualCommentEditDraftByAuthorLogin: state.manualCommentEditDraftByAuthorLogin,
    }),
    [state],
  );

  const value = useMemo<AuthorInsightsDraftsValue>(
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
