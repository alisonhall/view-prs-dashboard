import { useMemo } from 'react';
import { NeedsAttentionContext } from '../state/NeedsAttentionContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { createPrNeedsAttentionHelpers } from '../helpers/pr-needs-attention.helpers.js';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.js';
import { createPrRequestedReviewersHelpers } from '../helpers/pr-requested-reviewers.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { countPendingThreadComments } from '../helpers/pr-thread-comments.helpers.js';

const { isChangedStatus } = createPrStatusDisplayHelpers();

const asArray = (value) => (Array.isArray(value) ? value : []);

// Same field list/DOM ids as index.page.js's getNeedsAttentionConfig() -
// these 6 fields are always Context-native in the real app (FilterStateProvider
// mounts a real component for each one unconditionally), so
// window.getFilterStateValues() is normally authoritative. The direct
// element read is a fallback for the rare case nothing has assigned that
// bridge yet (or a harness simulates these fields with plain static markup
// instead of mounting the real components) - same handled/fallback shape
// index.page.js's own getFilterStateOverrideForFieldId/
// readAttentionConfigCheckbox pair already uses for every other
// Context-migrated field.
const readCheckboxField = (values, key, domId, fallback) => {
  const contextValue = values?.[key];
  if (typeof contextValue === 'boolean') return contextValue;
  const domValue = typeof document !== 'undefined' ? document.getElementById(domId)?.checked : undefined;
  return typeof domValue === 'boolean' ? domValue : fallback;
};

const readTextField = (values, key, domId, fallback) => {
  const contextValue = values?.[key];
  if (typeof contextValue === 'string' && contextValue) return contextValue;
  const domValue = typeof document !== 'undefined' ? document.getElementById(domId)?.value : undefined;
  return domValue || fallback;
};

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md, and
 * state/NeedsAttentionContext.jsx's own comment): derives the "needs
 * attention" config and classification helpers, replacing the
 * window.entryNeedsAttention/window.getNeedsAttentionConfig/
 * window.shouldShowNeedsAttention bridges for PrTableApp specifically.
 *
 * attentionConfig is deliberately read fresh on every render (not memoized)
 * rather than subscribed to via useFilterState() - matching
 * index.page.js's own former getNeedsAttentionConfig()'s "fresh on every
 * call" contract. It still needs *something* to force a re-render whenever
 * one of these 6 fields changes, though: every field is wired into
 * FilterStateProvider's own debounced-apply effect, so a change already
 * triggers a payload update (window.updateReactPrTable) - but
 * NeedsAttentionProvider sits between PrDataProvider and PrTableApp as a
 * *stable* children element (created once, by AppRoot/a test harness, never
 * recreated on PrDataProvider's own re-renders), so React's "same children
 * element" reconciliation bailout means a PrDataProvider-only state update
 * would otherwise skip re-rendering this component entirely - confirmed via
 * a real repro (an integration test's attention-icon assertions kept
 * reading stale DOM state across "Apply filters" clicks; console logging
 * showed PrDataProvider's setState firing every click but this component
 * only rendering once, at mount). usePrData() below exists ONLY to
 * subscribe to PrDataContext so that bailout gets punched through, the same
 * way it already does for any real usePrData() consumer (e.g. PrTableApp
 * itself) - its returned value is intentionally unused otherwise.
 */
export function NeedsAttentionProvider({ children }) {
  usePrData();
  const { normalizeActorLogin, resolveActorDisplayName, getEffectiveViewerLogin } = useActorIdentity();

  const helpers = useMemo(() => {
    const { collectAssignedUsers } = createPrAssignedUsersHelpers({
      asArray,
      normalizeActorLogin,
      resolveActorDisplayName,
    });
    const { collectRequestedReviewers } = createPrRequestedReviewersHelpers({
      asArray,
      resolveActorDisplayName,
    });
    return createPrNeedsAttentionHelpers({
      asArray,
      isChangedStatus,
      getEffectiveViewerLogin,
      collectAssignedUsers,
      collectRequestedReviewers,
      countPendingThreadComments,
    });
  }, [normalizeActorLogin, resolveActorDisplayName, getEffectiveViewerLogin]);

  // The 6 primitive fields are read fresh every render (cheap - a handful
  // of property/DOM reads), but attentionConfig itself is only given a new
  // object reference when one of them actually changed, so PrTableApp's own
  // useMemo (keyed on attentionConfig) doesn't recompute the whole section
  // list on every unrelated re-render.
  const values = typeof window !== 'undefined' ? window.getFilterStateValues?.() : undefined;
  const noActivityMode = readTextField(values, 'attentionNoActivityMode', 'attention-no-activity-mode', 'all');
  const includePendingComments = readCheckboxField(values, 'attentionIncludePendingComments', 'attention-include-pending-comments', true);
  const ignoreMergeOnlyCommits = readCheckboxField(values, 'attentionIgnoreMergeOnlyCommits', 'attention-ignore-merge-only-commits', false);
  const includeClosedMerged = readCheckboxField(values, 'attentionIncludeClosedMerged', 'attention-include-closed-merged', true);
  const includeDraftChanged = readCheckboxField(values, 'attentionIncludeDraftChanged', 'attention-include-draft-changed', true);
  const includeDraftNoActivity = readCheckboxField(values, 'attentionIncludeDraftNoActivity', 'attention-include-draft-no-activity', false);

  const attentionConfig = useMemo(
    () => ({
      noActivityMode,
      includePendingComments,
      ignoreMergeOnlyCommits,
      includeClosedMerged,
      includeDraftChanged,
      includeDraftNoActivity,
    }),
    [noActivityMode, includePendingComments, ignoreMergeOnlyCommits, includeClosedMerged, includeDraftChanged, includeDraftNoActivity],
  );

  const value = useMemo(() => ({ ...helpers, attentionConfig }), [helpers, attentionConfig]);

  return <NeedsAttentionContext.Provider value={value}>{children}</NeedsAttentionContext.Provider>;
}
