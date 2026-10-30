import type { PrData } from "../types/pr-data.ts";
import { createPrReviewStatsAggregationHelpers } from "./pr-review-stats-aggregation.helpers.ts";
import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";

// PrInsightsRow's "Open conversations" count: the data file's own count,
// else the metrics estimate. With a known viewer it's "Open conversations
// with me": unresolved threads the viewer took part in. The viewer comes
// from the injected getEffectiveViewerLogin (ActorIdentityContext), which
// falls back from the known viewer to the row's viewerLogin to the page.
const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
const { toCount } = createPrFormattingHelpers();

export interface PrOpenConversationCountDeps {
  getEffectiveViewerLogin?: (row: PrData | null | undefined) => string;
  asArray?: (value: unknown) => unknown[];
}

export interface OpenConversationCountWithMe {
  count: number;
  isViewerSpecific: boolean;
}

const createPrOpenConversationCountHelpers = ({ getEffectiveViewerLogin, asArray }: PrOpenConversationCountDeps = {}) => {
  const getEffectiveViewerLoginSafe =
    typeof getEffectiveViewerLogin === "function" ? getEffectiveViewerLogin : () => "";
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];

  const getOpenConversationCount = (row: PrData | null | undefined): number => {
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

  const getOpenConversationCountWithMe = (row: PrData | null | undefined): OpenConversationCountWithMe => {
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

export { createPrOpenConversationCountHelpers };
