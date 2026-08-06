(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsInsightMetricsSummaryHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrInsightMetricsSummaryHelpers = () => {
    const formatReviewFootprint = (metrics = {}) => {
      const counts = metrics?.counts || {};
      return `${counts.totalComments || 0} comments, ${counts.reviews || 0} reviews, ${counts.approvals || 0} approvals`;
    };

    const formatConversationStatus = (metrics = {}) => {
      const summary = metrics?.conversationSummary || {};
      const open =
        summary.estimatedOpenConversations || summary.openThreads || 0;
      const total =
        summary.estimatedTotalConversations || summary.totalThreads || 0;
      return `${open} open / ${total} total`;
    };

    const formatApprovalRisk = (metrics = {}) => {
      const summary = metrics?.approvalSummary || {};
      return `${summary.riskyApprovals || 0}/${summary.totalApprovals || 0} risky, ${summary.highRiskApprovals || 0} high-risk`;
    };

    const formatCommentUsefulness = (metrics = {}) => {
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

  return {
    createPrInsightMetricsSummaryHelpers,
  };
});
