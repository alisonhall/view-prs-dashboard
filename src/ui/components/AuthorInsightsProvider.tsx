import { useMemo, type ReactNode } from 'react';
import {
  AuthorInsightsContext,
  getOpenConversationCount,
  type AuthorInsightsValue,
} from '../state/AuthorInsightsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { createPrAuthorInsightsIdentityHelpers } from '../helpers/pr-author-insights-identity.helpers.ts';
import { createPrAuthorInsightsDisplayHelpers } from '../helpers/pr-author-insights-display.helpers.ts';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.ts';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.ts';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';
import { parseSortableTime } from '../helpers/pr-sortable-time.helpers.ts';

const { isChangedStatus } = createPrStatusDisplayHelpers();
const { formatIsoDatetime } = createPrFormattingHelpers();
const { normalizeAuthorInsightsSentiment, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } = createPrAuthorInsightsDraftsHelpers();
const { AUTHOR_COMMENT_SENTIMENT_OPTIONS } = createPrAuthorInsightsDataHelpers();

// These only close over the module-level constants above - never
// `payload` or actor identity - so they're built once here, not inside
// the component's own useMemo. Bundling them into that per-render memo
// used to give them a fresh reference every time `payload` changed (e.g.
// on every poll tick), which silently retriggered any effect keying on
// one of them - concretely, AuthorInsightsCommentsSection's per-author
// refresh effect includes sortAuthorInsightsManualCommentsDesc in its
// deps (react-hooks/exhaustive-deps requires it), so an unrelated poll
// landing while a comment was being edited reset editingCommentId to
// null, silently closing the edit form.
const stableDisplay = createPrAuthorInsightsDisplayHelpers({
  normalizeAuthorInsightsSentiment,
  isChangedStatus,
  asArray,
  parseSortableTime,
  formatIsoDatetime,
});

const stableValue = {
  getAuthorInsightsSentimentLabel: stableDisplay.getAuthorInsightsSentimentLabel,
  getAuthorInsightsSentimentBadgeClassName: stableDisplay.getAuthorInsightsSentimentBadgeClassName,
  getAuthorInsightsStatusBadgeClassName: stableDisplay.getAuthorInsightsStatusBadgeClassName,
  getAuthorInsightsCreatedPrStatus: stableDisplay.getAuthorInsightsCreatedPrStatus,
  sortAuthorInsightsCreatedPrsDesc: stableDisplay.sortAuthorInsightsCreatedPrsDesc,
  sortAuthorInsightsNoteMatchesDesc: stableDisplay.sortAuthorInsightsNoteMatchesDesc,
  sortAuthorInsightsManualCommentsDesc: stableDisplay.sortAuthorInsightsManualCommentsDesc,
  getAuthorInsightsNoteDisplayTimestamp: stableDisplay.getAuthorInsightsNoteDisplayTimestamp,
  normalizeAuthorInsightsSentiment,
  DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  AUTHOR_COMMENT_SENTIMENT_OPTIONS,
  getOpenConversationCount,
  parseSortableTime,
};

/**
 * Builds the Author Insights tab's display/formatting/sorting functions
 * (see state/AuthorInsightsContext.tsx).
 *
 * Only getAuthorInsightsDisplayName/noteAuthorMatchesSelection/
 * buildAuthorInsightsEntries genuinely need payload/actor identity -
 * everything else comes from the module-level stableValue above (see its
 * own comment for why that split matters).
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up - see react-app.tsx and
 * AppShell for the actual nesting.
 */
export function AuthorInsightsProvider({ children }: { children?: ReactNode }) {
  const { payload } = usePrData();
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = useActorIdentity();

  const value = useMemo<AuthorInsightsValue>(() => {
    const getLatestActorsMap = () => payload?.actorsMap || {};

    const { getAuthorInsightsDisplayName, noteAuthorMatchesSelection } = createPrAuthorInsightsIdentityHelpers({
      normalizeActorLogin,
      resolveActorDisplayName,
      getLatestActorsMap,
    });

    const { buildAuthorInsightsEntries } = createPrAuthorInsightsDisplayHelpers({
      resolveActorDisplayName,
      getPreferredActorKey,
    });

    return {
      ...stableValue,
      getAuthorInsightsDisplayName,
      noteAuthorMatchesSelection,
      buildAuthorInsightsEntries,
    };
  }, [payload, normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey]);

  return <AuthorInsightsContext.Provider value={value}>{children}</AuthorInsightsContext.Provider>;
}
