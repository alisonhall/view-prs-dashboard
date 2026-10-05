import { createPrReviewStatsAggregationHelpers } from "./pr-review-stats-aggregation.helpers.js";
import { createPrFormattingHelpers } from "./pr-formatting.helpers.js";

// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former getOpenConversationCount/getOpenConversationCountWithMe bodies
// into a DI-factory module, so PrInsightsRow.jsx can import it directly
// instead of reading window.getOpenConversationCountWithMe.
// getOpenConversationCountWithMe genuinely needs the current viewer's
// login (confirmed by reading the body directly, not a zero-dependency
// function despite first appearances) - it used to read a three-tier
// fallback chain (currentViewerLogin || row.viewerLogin ||
// inferViewerLoginFromPage()) off index.page.js's own module state;
// getEffectiveViewerLogin(row) (ActorIdentityContext) is that exact same
// derivation, already Context-native, so it's injected here instead of
// reimplementing the chain.
export const { createPrOpenConversationCountHelpers } = (() => {
  const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
  const { toCount } = createPrFormattingHelpers();

  const createPrOpenConversationCountHelpers = ({ getEffectiveViewerLogin, asArray } = {}) => {
    const getEffectiveViewerLoginSafe =
      typeof getEffectiveViewerLogin === "function" ? getEffectiveViewerLogin : () => "";
    const asArraySafe =
      typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);

    const getOpenConversationCount = (row) => {
      const openConversationCountRaw = row?.openConversationCount;
      const metrics = normalizeRowMetrics(row);
      const fallbackOpenConversations =
        metrics.conversationSummary.estimatedOpenConversations ||
        metrics.counts.openConversations ||
        metrics.conversationSummary.openThreads;

      return Number.isFinite(Number(openConversationCountRaw))
        ? Number(openConversationCountRaw)
        : toCount(fallbackOpenConversations);
    };

    const getOpenConversationCountWithMe = (row) => {
      const viewerLogin = String(getEffectiveViewerLoginSafe(row) || "")
        .trim()
        .toLowerCase();

      if (!viewerLogin) {
        return {
          count: getOpenConversationCount(row),
          isViewerSpecific: false,
        };
      }

      const openThreads = asArraySafe(row?.reviewThreads).filter(
        (thread) => thread && thread.isResolved !== true,
      );

      return {
        count: openThreads.filter((thread) => {
          const participants = asArraySafe(thread?.participants).map((p) =>
            String(p || "")
              .trim()
              .toLowerCase(),
          );
          if (participants.includes(viewerLogin)) {
            return true;
          }

          return asArraySafe(thread?.comments).some(
            (comment) =>
              String(comment?.authorLogin || "")
                .trim()
                .toLowerCase() === viewerLogin,
          );
        }).length,
        isViewerSpecific: true,
      };
    };

    return {
      getOpenConversationCount,
      getOpenConversationCountWithMe,
    };
  };

  return {
    createPrOpenConversationCountHelpers,
  };
})();
