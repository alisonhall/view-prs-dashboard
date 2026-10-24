import { useContext, useMemo, type ReactNode } from 'react';
import { NeedsAttentionContext } from '../state/NeedsAttentionContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { FilterStateContext } from '../state/FilterStateContext';
import type { FilterValues } from '../state/filterValuesStore';
import { createPrNeedsAttentionHelpers, type AttentionConfig } from '../helpers/pr-needs-attention.helpers.ts';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.ts';
import { createPrRequestedReviewersHelpers } from '../helpers/pr-requested-reviewers.helpers.ts';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.ts';
import { countPendingThreadComments } from '../helpers/pr-thread-comments.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';

const { isChangedStatus } = createPrStatusDisplayHelpers();

// Same defaults FilterStateProvider's own getUiOptionDefaults()
// (pr-ui-option-persistence.helpers.ts) assigns these 6 fields - used only
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
 * Derives the "needs attention" config and classification helpers from the
 * Run & Filter form's attention fields and the actor identity.
 *
 * It reads FilterStateContext directly, so a change to any attention rule
 * re-renders it (and updates attention icons and smart-group membership)
 * straight away, even though it sits between PrDataProvider and PrTableApp
 * as a stable children element that a parent re-render alone wouldn't
 * reach.
 */
export function NeedsAttentionProvider({ children }: { children?: ReactNode }) {
  const filterState = useContext(FilterStateContext);
  const values: FilterValues = filterState?.values || DEFAULT_ATTENTION_VALUES;
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

  const attentionConfig = useMemo<AttentionConfig>(
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
