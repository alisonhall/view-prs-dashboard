import { useContext, useMemo } from 'react';
import { NeedsAttentionContext } from '../state/NeedsAttentionContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { FilterStateContext } from '../state/FilterStateContext';
import { createPrNeedsAttentionHelpers } from '../helpers/pr-needs-attention.helpers.js';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.js';
import { createPrRequestedReviewersHelpers } from '../helpers/pr-requested-reviewers.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { countPendingThreadComments } from '../helpers/pr-thread-comments.helpers.ts';

const { isChangedStatus } = createPrStatusDisplayHelpers();

const asArray = (value) => (Array.isArray(value) ? value : []);

// Same defaults FilterStateProvider's own getUiOptionDefaults()
// (pr-ui-option-persistence.helpers.js) assigns these 6 fields - used only
// as a fallback for when there's no <FilterStateProvider> ancestor at all
// (integration-tests/index.html.test.js's isolated PrTableApp mounts),
// same shape useVisiblePrNumbers.jsx's own DEFAULT_FILTER_STATE_VALUES
// fallback already uses for its own fields.
const DEFAULT_ATTENTION_VALUES = {
  attentionNoActivityMode: 'all',
  attentionIncludePendingComments: true,
  attentionIgnoreMergeOnlyCommits: false,
  attentionIncludeClosedMerged: true,
  attentionIncludeDraftChanged: true,
  attentionIncludeDraftNoActivity: false,
};

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md, and
 * state/NeedsAttentionContext.jsx's own comment): derives the "needs
 * attention" config and classification helpers, replacing the
 * window.entryNeedsAttention/window.getNeedsAttentionConfig/
 * window.shouldShowNeedsAttention bridges for PrTableApp specifically.
 *
 * Phase H.18 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 1): attentionConfig now reads FilterStateContext directly
 * (`useContext`, same as useVisiblePrNumbers.jsx's own
 * useFilteredPrRows() already does for its own fields) instead of
 * window.getFilterStateValues()/raw DOM reads. That indirection used to
 * need *something else* to force this component to re-render at all,
 * since it sits between PrDataProvider and PrTableApp as a stable
 * children element (created once, never recreated on PrDataProvider's
 * own re-renders) - a bare usePrData() call existed purely to punch
 * through React's "same children element" reconciliation bailout, with
 * its own returned value unused. Subscribing to FilterStateContext
 * directly makes that punch-through unnecessary - the Context *value*
 * changing is what triggers the re-render now, regardless of whether
 * this component is a stable children element, the same way any other
 * useContext() consumer anywhere in this app already works. User-visible
 * effect of this phase (confirmed intentional, not a side effect): these
 * 6 fields now update attention icons/smart-group membership instantly,
 * like every other Context-migrated filter field, instead of only after
 * "Apply filters (local)" (or the previous 150ms-debounced auto-apply).
 */
export function NeedsAttentionProvider({ children }) {
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_ATTENTION_VALUES;
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

  const attentionConfig = useMemo(
    () => ({
      noActivityMode: values.attentionNoActivityMode ?? DEFAULT_ATTENTION_VALUES.attentionNoActivityMode,
      includePendingComments:
        values.attentionIncludePendingComments ?? DEFAULT_ATTENTION_VALUES.attentionIncludePendingComments,
      ignoreMergeOnlyCommits:
        values.attentionIgnoreMergeOnlyCommits ?? DEFAULT_ATTENTION_VALUES.attentionIgnoreMergeOnlyCommits,
      includeClosedMerged: values.attentionIncludeClosedMerged ?? DEFAULT_ATTENTION_VALUES.attentionIncludeClosedMerged,
      includeDraftChanged: values.attentionIncludeDraftChanged ?? DEFAULT_ATTENTION_VALUES.attentionIncludeDraftChanged,
      includeDraftNoActivity:
        values.attentionIncludeDraftNoActivity ?? DEFAULT_ATTENTION_VALUES.attentionIncludeDraftNoActivity,
    }),
    [
      values.attentionNoActivityMode,
      values.attentionIncludePendingComments,
      values.attentionIgnoreMergeOnlyCommits,
      values.attentionIncludeClosedMerged,
      values.attentionIncludeDraftChanged,
      values.attentionIncludeDraftNoActivity,
    ],
  );

  const value = useMemo(() => ({ ...helpers, attentionConfig }), [helpers, attentionConfig]);

  return <NeedsAttentionContext.Provider value={value}>{children}</NeedsAttentionContext.Provider>;
}
