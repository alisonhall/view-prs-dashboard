import type { PrMetrics } from "../types/pr-data.ts";

// One-line summaries of a PR's insight metrics for the detail pane's
// Overview tab. Only the summary parts are read, so the raw metrics and
// normalizeRowMetrics' output both fit.
type Metrics = Pick<PrMetrics, "counts" | "conversationSummary" | "approvalSummary" | "commentUsefulnessSummary"> | null | undefined;

const createPrInsightMetricsSummaryHelpers = () => {
  const formatReviewFootprint = (metrics: Metrics = {}): string => {
    const counts = metrics?.counts || {};
    return `${counts.totalComments || 0} comments, ${counts.reviews || 0} reviews, ${counts.approvals || 0} approvals`;
  };

  const formatConversationStatus = (metrics: Metrics = {}): string => {
    const summary = metrics?.conversationSummary || {};
    const open =
      summary.estimatedOpenConversations || summary.openThreads || 0;
    const total =
      summary.estimatedTotalConversations || summary.totalThreads || 0;
    return `${open} open / ${total} total`;
  };

  const formatApprovalRisk = (metrics: Metrics = {}): string => {
    const summary = metrics?.approvalSummary || {};
    return `${summary.riskyApprovals || 0}/${summary.totalApprovals || 0} risky, ${summary.highRiskApprovals || 0} high-risk`;
  };

  const formatCommentUsefulness = (metrics: Metrics = {}): string => {
    const summary = metrics?.commentUsefulnessSummary || {};
    return `${summary.usefulnessSignals || 0} signals (${summary.commentsFollowedByAuthorCommit || 0} comments followed by author commits, ${summary.resolvedThreadCommentsOnOthersPrs || 0} on resolved threads)`;
  };

  return {
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
  };
};

export { createPrInsightMetricsSummaryHelpers };
