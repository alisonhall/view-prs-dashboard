import { useEffect, useMemo, useRef } from 'react';
import { useNotesDirty } from '../state/NotesDirtyContext';
import { useAuthorInsightsDrafts, useAuthorInsightsDraftsVersion } from '../state/AuthorInsightsDraftsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { useAutoRenderBlockingActions } from '../state/AutoRenderBlockingContext';
import { createPrAutoRenderUnsavedHelpers } from '../helpers/pr-auto-render-unsaved.helpers.js';
import { createPrAutoRenderBlockingHelpers } from '../helpers/pr-auto-render-blocking.helpers.js';
import { createPrAutoRenderStateHelpers } from '../helpers/pr-auto-render-state.helpers.js';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.js';
import { createPrAuthorInsightsIdentityHelpers } from '../helpers/pr-author-insights-identity.helpers.js';

// Zero-dependency, built once - same precedent as AutoRenderBlockingProvider.jsx.
const { isAuthorInsightsComposerDraftDirty, isAuthorInsightsEditDraftDirty } =
  createPrAuthorInsightsDraftsHelpers();

/**
 * Window-bridge elimination Phase 7.4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * computes the auto-render-blocking state - which PRs have unsaved Notes
 * edits and which authors have an unsaved manual-comment draft - and pushes
 * it into AutoRenderBlockingProvider via `setBlockingState`. Renders nothing.
 *
 * Replaces index.page.js's recomputeDirtyPrSectionsFields, which
 * NotesDirtyProvider/AuthorInsightsDraftsProvider called through window on
 * every change, and which read their state back through
 * window.getDirtyNotesPrNumbers/getAuthorInsightsDraftsSnapshot/
 * getAuthorManualCommentsForLogin and the payload through
 * window.getReactPrTablePayload. The same pure helpers compute the same
 * state; only the inputs now come from Context.
 *
 * Must sit inside NotesDirtyProvider, AuthorInsightsDraftsProvider and
 * PrDataProvider (for actor identity and the payload's actorsMap, which
 * orders the blocking authors by display name) - react-app.jsx's AppRoot
 * mounts it just inside AuthorInsightsDraftsProvider. It is the only
 * subscriber to AuthorInsightsDraftsVersionContext, so a keystroke in a
 * draft re-renders this (and nothing else that reads the drafts Context).
 *
 * The recompute runs in an effect, after React has committed: the old
 * vanilla #pr-sections input/change/click listeners had to defer it with a
 * setTimeout so the synchronous Provider update didn't revert a controlled
 * input mid-keystroke (see git history for index.page.js's
 * recomputeDirtyOnEvent). An effect already runs after the input's own
 * onChange has committed, and those listeners only ever re-read the same
 * Context-owned state this component subscribes to, so they're gone.
 */
export function AutoRenderBlockingSync() {
  const { dirtyPrNumbers } = useNotesDirty();
  const { getDraftsSnapshot, getManualComments } = useAuthorInsightsDrafts();
  const draftsVersion = useAuthorInsightsDraftsVersion();
  const { normalizeActorLogin, resolveActorDisplayName } = useActorIdentity();
  const { payload } = usePrData();
  const { setBlockingState } = useAutoRenderBlockingActions();

  const actorsMap = payload?.actorsMap;
  const getAuthorInsightsDisplayName = useMemo(
    () =>
      createPrAuthorInsightsIdentityHelpers({
        normalizeActorLogin,
        resolveActorDisplayName,
        getLatestActorsMap: () => actorsMap || {},
      }).getAuthorInsightsDisplayName,
    [normalizeActorLogin, resolveActorDisplayName, actorsMap],
  );

  // A push re-renders AutoRenderBlockingProvider and schedules a flush check;
  // skip it when nothing changed (most draft keystrokes don't change which
  // authors are blocking).
  const lastPushedRef = useRef(null);

  useEffect(() => {
    const { getUnsavedNotesPrNumbers, getBlockingPrNumbers, normalizePrNumber } =
      createPrAutoRenderUnsavedHelpers({ getDirtyNotesPrNumbers: () => dirtyPrNumbers });
    const { formatBlockingPrNumbersLabel, getBlockingAuthorInsightsLogins } = createPrAutoRenderBlockingHelpers({
      normalizePrNumber,
      normalizeActorLogin,
      isAuthorInsightsComposerDraftDirty,
      getAuthorManualCommentsForLogin: getManualComments,
      isAuthorInsightsEditDraftDirty,
      getAuthorInsightsDisplayName,
    });
    const { getAutoRenderBlockingState } = createPrAutoRenderStateHelpers({
      getUnsavedNotesPrNumbers,
      getBlockingPrNumbers,
      getBlockingAuthorInsightsLogins: () => getBlockingAuthorInsightsLogins(getDraftsSnapshot()),
      formatBlockingPrNumbersLabel,
    });

    const blockingState = getAutoRenderBlockingState();
    const serialized = JSON.stringify(blockingState);
    if (serialized === lastPushedRef.current) return;
    lastPushedRef.current = serialized;
    setBlockingState(blockingState);
  }, [
    dirtyPrNumbers,
    draftsVersion,
    getDraftsSnapshot,
    getManualComments,
    normalizeActorLogin,
    getAuthorInsightsDisplayName,
    setBlockingState,
  ]);

  return null;
}
