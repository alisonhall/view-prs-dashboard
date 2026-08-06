(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsAggregationHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsAggregationHelpers = ({
    toCount,
    asArray,
    getNormalizedStatsDateRange,
    normalizeActorLogin,
    getPreferredActorKey,
    formatTitleWithIcons,
    isWithinStatsDateRange,
    resolveActorDisplayName,
    statsViewState,
  } = {}) => {
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
    const asArraySafe =
      typeof asArray === "function"
        ? asArray
        : (value) => (Array.isArray(value) ? value : []);
    const getNormalizedStatsDateRangeSafe =
      typeof getNormalizedStatsDateRange === "function"
        ? getNormalizedStatsDateRange
        : () => ({ start: "", end: "", startDate: "", endDate: "" });
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();
    const getPreferredActorKeySafe =
      typeof getPreferredActorKey === "function"
        ? getPreferredActorKey
        : (login, fallback) => String(login || fallback || "").trim();
    const formatTitleWithIconsSafe =
      typeof formatTitleWithIcons === "function"
        ? formatTitleWithIcons
        : (_titleDisplay, title) => String(title || "").trim();
    const isWithinStatsDateRangeSafe =
      typeof isWithinStatsDateRange === "function"
        ? isWithinStatsDateRange
        : () => true;
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallback) =>
            String(fallback || login || "").trim();
    const statsViewStateSafe =
      statsViewState && typeof statsViewState === "object"
        ? statsViewState
        : {
            sortBy: "riskyApprovals",
            filterMode: "all",
            topN: 12,
            minComments: 0,
          };

    const normalizeRowMetrics = (row = {}) => {
      const metrics = row?.metrics || {};
      const counts = metrics?.counts || {};
      const approvalSummary = metrics?.approvalSummary || {};
      const commentUsefulnessSummary = metrics?.commentUsefulnessSummary || {};
      const conversationSummary = metrics?.conversationSummary || {};

      return {
        counts: {
          topLevelComments: toCountSafe(counts.topLevelComments),
          threadComments: toCountSafe(counts.threadComments),
          totalComments: toCountSafe(counts.totalComments),
          reviews: toCountSafe(counts.reviews),
          approvals: toCountSafe(counts.approvals),
          commits: toCountSafe(counts.commits),
          conversations: toCountSafe(counts.conversations),
          openConversations: toCountSafe(counts.openConversations),
        },
        commentsByActor: asArraySafe(metrics.commentsByActor),
        reviewsByActor: asArraySafe(metrics.reviewsByActor),
        approvals: asArraySafe(metrics.approvals),
        approvalSummary: {
          totalApprovals: toCountSafe(approvalSummary.totalApprovals),
          riskyApprovals: toCountSafe(approvalSummary.riskyApprovals),
          highRiskApprovals: toCountSafe(approvalSummary.highRiskApprovals),
          approvalsWithChangeRequestsAfter: toCountSafe(
            approvalSummary.approvalsWithChangeRequestsAfter,
          ),
          approvalsWithCommentsAfter: toCountSafe(
            approvalSummary.approvalsWithCommentsAfter,
          ),
          approvalsWithCommitsAfter: toCountSafe(
            approvalSummary.approvalsWithCommitsAfter,
          ),
          averageMergeLeadMinutes: Number.isFinite(
            Number(approvalSummary.averageMergeLeadMinutes),
          )
            ? Number(approvalSummary.averageMergeLeadMinutes)
            : null,
        },
        commentUsefulnessSummary: {
          commentsOnOthersPrs: toCountSafe(
            commentUsefulnessSummary.commentsOnOthersPrs,
          ),
          resolvedThreadCommentsOnOthersPrs: toCountSafe(
            commentUsefulnessSummary.resolvedThreadCommentsOnOthersPrs,
          ),
          commentsFollowedByAuthorCommit: toCountSafe(
            commentUsefulnessSummary.commentsFollowedByAuthorCommit,
          ),
          commentsFollowedByAuthorCommitWithin24h: toCountSafe(
            commentUsefulnessSummary.commentsFollowedByAuthorCommitWithin24h,
          ),
          usefulnessSignals: toCountSafe(commentUsefulnessSummary.usefulnessSignals),
        },
        conversationSummary: {
          totalThreads: toCountSafe(conversationSummary.totalThreads),
          openThreads: toCountSafe(conversationSummary.openThreads),
          resolvedThreads: toCountSafe(conversationSummary.resolvedThreads),
          totalThreadComments: toCountSafe(conversationSummary.totalThreadComments),
          topLevelConversations: toCountSafe(
            conversationSummary.topLevelConversations,
          ),
          reviewConversations: toCountSafe(conversationSummary.reviewConversations),
          estimatedTotalConversations: toCountSafe(
            conversationSummary.estimatedTotalConversations,
          ),
          estimatedOpenConversations: toCountSafe(
            conversationSummary.estimatedOpenConversations,
          ),
        },
      };
    };

    const buildReviewerStats = (rows, actorsMap = {}) => {
      const range = getNormalizedStatsDateRangeSafe();
      const reviewers = new Map();
      const summary = {
        rows: 0,
        commentsOnOthersPrs: 0,
        usefulnessSignals: 0,
        commentsFollowedByAuthorCommit: 0,
        resolvedThreadCommentsOnOthersPrs: 0,
        approvals: 0,
        riskyApprovals: 0,
        highRiskApprovals: 0,
        openConversations: 0,
        sources: {
          rows: [],
          commentsOnOthersPrs: [],
          usefulnessSignals: [],
          commentsFollowedByAuthorCommit: [],
          resolvedThreadCommentsOnOthersPrs: [],
          approvals: [],
          riskyApprovals: [],
          highRiskApprovals: [],
          openConversations: [],
        },
      };

      const pushSource = (bucket, item) => {
        if (!Array.isArray(bucket) || !item) return;
        bucket.push(item);
      };

      const ensureReviewer = (login, fallbackName = "") => {
        const normalizedLogin = normalizeActorLoginSafe(login);
        const normalizedFallbackName = String(fallbackName || "").trim();
        const reviewerLogin = normalizedLogin || String(login || "").trim();
        if (!reviewerLogin) return null;
        if (!reviewers.has(reviewerLogin)) {
          reviewers.set(reviewerLogin, {
            login: reviewerLogin,
            name: normalizedFallbackName || reviewerLogin,
            comments: 0,
            threadComments: 0,
            resolvedThreadComments: 0,
            commentsFollowedByAuthorCommit: 0,
            commentsFollowedByAuthorCommitWithin24h: 0,
            usefulnessSignals: 0,
            reviews: 0,
            approvals: 0,
            riskyApprovals: 0,
            highRiskApprovals: 0,
            approvalsBeforeChangeRequest: 0,
            prsTouched: new Set(),
            sources: {
              comments: [],
              reviews: [],
              approvals: [],
              riskyApprovals: [],
              highRiskApprovals: [],
              usefulnessSignals: [],
              commentsFollowedByAuthorCommit: [],
              resolvedThreadComments: [],
            },
          });
        }
        const stat = reviewers.get(reviewerLogin);
        if (normalizedFallbackName && stat.name === stat.login) {
          stat.name = normalizedFallbackName;
        }
        return stat;
      };

      for (const entry of rows) {
        const row = entry?.data || {};
        const rowAuthorKey = getPreferredActorKeySafe(row.authorLogin, row.author);
        const prNumber = String(row.number || entry?.prNumber || "").trim();
        const prTitle = formatTitleWithIconsSafe(row.titleDisplay, row.title);
        const metrics = normalizeRowMetrics(row);
        const filteredCommentEvents = asArraySafe(row.commentEvents).filter(
          (event) =>
            normalizeActorLoginSafe(event?.actor) !==
              String(rowAuthorKey || "").trim() &&
            isWithinStatsDateRangeSafe(event?.occurredAt, range),
        );
        const filteredReviews = asArraySafe(row.reviews).filter(
          (review) =>
            normalizeActorLoginSafe(review?.authorLogin) !==
              String(rowAuthorKey || "").trim() &&
            isWithinStatsDateRangeSafe(review?.submittedAt, range),
        );
        const filteredApprovals = asArraySafe(metrics.approvals).filter((approval) =>
          isWithinStatsDateRangeSafe(approval?.approvedAt, range),
        );
        const filteredOpenThreads = asArraySafe(row.reviewThreads).filter((thread) => {
          if (thread?.isResolved === true) {
            return false;
          }
          const comments = asArraySafe(thread?.comments);
          if (!range.start && !range.end) {
            return true;
          }
          return comments.some((comment) =>
            isWithinStatsDateRangeSafe(comment?.createdAt, range),
          );
        });
        const prContext = {
          prNumber,
          prTitle,
          prUrl: String(row.url || "").trim(),
          prAuthor: resolveActorDisplayNameSafe(rowAuthorKey, actorsMap, row.author),
        };

        const rowContributes =
          filteredCommentEvents.length > 0 ||
          filteredReviews.length > 0 ||
          filteredApprovals.length > 0 ||
          filteredOpenThreads.length > 0;
        if (rowContributes || (!range.start && !range.end)) {
          summary.rows += 1;
          pushSource(summary.sources.rows, prContext);
        }

        summary.openConversations += filteredOpenThreads.length;
        if (filteredOpenThreads.length > 0) {
          pushSource(summary.sources.openConversations, {
            ...prContext,
            count: filteredOpenThreads.length,
          });
        }

        const commentsByActor = new Map();
        filteredCommentEvents.forEach((event) => {
          const login = normalizeActorLoginSafe(event?.actor);
          if (!login) return;
          if (!commentsByActor.has(login)) {
            commentsByActor.set(login, {
              login,
              name: login,
              topLevelCount: 0,
              threadCount: 0,
              resolvedThreadCount: 0,
              followedByAuthorCommitCount: 0,
              followedByAuthorCommitWithin24hCount: 0,
              usefulnessSignals: 0,
              totalCount: 0,
              commentsOnOthersPr: true,
            });
          }
          const commentStat = commentsByActor.get(login);
          commentStat.totalCount += 1;
          if (event?.channel === "thread") {
            commentStat.threadCount += 1;
          } else {
            commentStat.topLevelCount += 1;
          }
          if (event?.conversationResolved === true) {
            commentStat.resolvedThreadCount += 1;
          }

          const followingAuthorCommits = asArraySafe(row.activityEvents).filter(
            (activityEvent) =>
              activityEvent?.type === "commit" &&
              normalizeActorLoginSafe(activityEvent?.actor) ===
                String(rowAuthorKey || "").trim() &&
              String(activityEvent?.occurredAt || "") >
                String(event?.occurredAt || ""),
          );
          if (followingAuthorCommits.length > 0) {
            commentStat.followedByAuthorCommitCount += 1;
            const within24h = followingAuthorCommits.some((activityEvent) => {
              const commentTime = Date.parse(String(event?.occurredAt || ""));
              const commitTime = Date.parse(
                String(activityEvent?.occurredAt || ""),
              );
              return (
                Number.isFinite(commentTime) &&
                Number.isFinite(commitTime) &&
                commitTime - commentTime <= 24 * 60 * 60 * 1000
              );
            });
            if (within24h) {
              commentStat.followedByAuthorCommitWithin24hCount += 1;
            }
          }
          commentStat.usefulnessSignals =
            commentStat.resolvedThreadCount +
            commentStat.followedByAuthorCommitCount +
            commentStat.followedByAuthorCommitWithin24hCount;
        });

        const reviewsByActor = new Map();
        filteredReviews.forEach((review) => {
          const login = normalizeActorLoginSafe(review?.authorLogin);
          if (!login) return;
          if (!reviewsByActor.has(login)) {
            reviewsByActor.set(login, {
              login,
              name: String(review?.authorName || login).trim() || login,
              reviewCount: 0,
              approvalCount: 0,
              commentCount: 0,
              changesRequestedCount: 0,
              dismissedCount: 0,
              reviewsOnOthersPr: true,
            });
          }
          const reviewStat = reviewsByActor.get(login);
          reviewStat.reviewCount += 1;
          const reviewState = String(review?.state || "").trim();
          if (reviewState === "APPROVED") reviewStat.approvalCount += 1;
          if (reviewState === "COMMENTED") reviewStat.commentCount += 1;
          if (reviewState === "CHANGES_REQUESTED")
            reviewStat.changesRequestedCount += 1;
          if (reviewState === "DISMISSED") reviewStat.dismissedCount += 1;
        });

        for (const commentStat of commentsByActor.values()) {
          const reviewer = ensureReviewer(commentStat.login, commentStat.name);
          if (!reviewer) continue;
          reviewer.comments += toCountSafe(commentStat.totalCount);
          reviewer.threadComments += toCountSafe(commentStat.threadCount);
          reviewer.resolvedThreadComments += toCountSafe(
            commentStat.resolvedThreadCount,
          );
          reviewer.commentsFollowedByAuthorCommit += toCountSafe(
            commentStat.followedByAuthorCommitCount,
          );
          reviewer.commentsFollowedByAuthorCommitWithin24h += toCountSafe(
            commentStat.followedByAuthorCommitWithin24hCount,
          );
          reviewer.usefulnessSignals += toCountSafe(commentStat.usefulnessSignals);
          if (prNumber) reviewer.prsTouched.add(prNumber);
          summary.commentsOnOthersPrs += toCountSafe(commentStat.totalCount);
          summary.usefulnessSignals += toCountSafe(commentStat.usefulnessSignals);
          summary.commentsFollowedByAuthorCommit += toCountSafe(
            commentStat.followedByAuthorCommitCount,
          );
          summary.resolvedThreadCommentsOnOthersPrs += toCountSafe(
            commentStat.resolvedThreadCount,
          );
          pushSource(reviewer.sources.comments, {
            ...prContext,
            count: toCountSafe(commentStat.totalCount),
            threadCount: toCountSafe(commentStat.threadCount),
            resolvedThreadCount: toCountSafe(commentStat.resolvedThreadCount),
          });
          pushSource(summary.sources.commentsOnOthersPrs, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            count: toCountSafe(commentStat.totalCount),
          });
          if (toCountSafe(commentStat.usefulnessSignals) > 0) {
            pushSource(reviewer.sources.usefulnessSignals, {
              ...prContext,
              count: toCountSafe(commentStat.usefulnessSignals),
            });
            pushSource(summary.sources.usefulnessSignals, {
              ...prContext,
              reviewer: reviewer.name || reviewer.login,
              count: toCountSafe(commentStat.usefulnessSignals),
            });
          }
          if (toCountSafe(commentStat.followedByAuthorCommitCount) > 0) {
            pushSource(reviewer.sources.commentsFollowedByAuthorCommit, {
              ...prContext,
              count: toCountSafe(commentStat.followedByAuthorCommitCount),
            });
            pushSource(summary.sources.commentsFollowedByAuthorCommit, {
              ...prContext,
              reviewer: reviewer.name || reviewer.login,
              count: toCountSafe(commentStat.followedByAuthorCommitCount),
            });
          }
          if (toCountSafe(commentStat.resolvedThreadCount) > 0) {
            pushSource(reviewer.sources.resolvedThreadComments, {
              ...prContext,
              count: toCountSafe(commentStat.resolvedThreadCount),
            });
            pushSource(summary.sources.resolvedThreadCommentsOnOthersPrs, {
              ...prContext,
              reviewer: reviewer.name || reviewer.login,
              count: toCountSafe(commentStat.resolvedThreadCount),
            });
          }
        }

        for (const reviewStat of reviewsByActor.values()) {
          const reviewer = ensureReviewer(reviewStat.login, reviewStat.name);
          if (!reviewer) continue;
          reviewer.reviews += toCountSafe(reviewStat.reviewCount);
          reviewer.approvals += toCountSafe(reviewStat.approvalCount);
          if (prNumber) reviewer.prsTouched.add(prNumber);
          pushSource(reviewer.sources.reviews, {
            ...prContext,
            count: toCountSafe(reviewStat.reviewCount),
            approvals: toCountSafe(reviewStat.approvalCount),
          });
        }

        for (const approval of filteredApprovals) {
          const reviewer = ensureReviewer(approval.login, approval.name);
          if (!reviewer) continue;
          reviewer.approvals += 0;
          reviewer.riskyApprovals += approval.riskyApproval ? 1 : 0;
          reviewer.highRiskApprovals += approval.highRiskApproval ? 1 : 0;
          reviewer.approvalsBeforeChangeRequest +=
            toCountSafe(approval.changeRequestCountAfterApproval) > 0 ? 1 : 0;
          if (prNumber) reviewer.prsTouched.add(prNumber);
          summary.approvals += 1;
          summary.riskyApprovals += approval.riskyApproval ? 1 : 0;
          summary.highRiskApprovals += approval.highRiskApproval ? 1 : 0;
          pushSource(reviewer.sources.approvals, {
            ...prContext,
            approvedAt: approval.approvedAt,
            risky: approval.riskyApproval === true,
            highRisk: approval.highRiskApproval === true,
          });
          pushSource(summary.sources.approvals, {
            ...prContext,
            reviewer: reviewer.name || reviewer.login,
            approvedAt: approval.approvedAt,
          });
          if (approval.riskyApproval) {
            pushSource(reviewer.sources.riskyApprovals, {
              ...prContext,
              approvedAt: approval.approvedAt,
            });
            pushSource(summary.sources.riskyApprovals, {
              ...prContext,
              reviewer: reviewer.name || reviewer.login,
              approvedAt: approval.approvedAt,
            });
          }
          if (approval.highRiskApproval) {
            pushSource(reviewer.sources.highRiskApprovals, {
              ...prContext,
              approvedAt: approval.approvedAt,
            });
            pushSource(summary.sources.highRiskApprovals, {
              ...prContext,
              reviewer: reviewer.name || reviewer.login,
              approvedAt: approval.approvedAt,
            });
          }
        }
      }

      const reviewerRows = Array.from(reviewers.values()).map((reviewer) => ({
        ...reviewer,
        name: resolveActorDisplayNameSafe(reviewer.login, actorsMap, reviewer.name),
        prCount: reviewer.prsTouched.size,
      }));

      return { summary, reviewerRows };
    };

    const applyStatsControls = ({ summary, reviewerRows }) => {
      const sortKey = statsViewStateSafe.sortBy;
      const minComments = Math.max(0, toCountSafe(statsViewStateSafe.minComments));
      const topN = Math.max(1, toCountSafe(statsViewStateSafe.topN) || 12);
      const filterMode = String(statsViewStateSafe.filterMode || "all");

      const filteredRows = reviewerRows.filter((reviewer) => {
        if (reviewer.comments < minComments) {
          return false;
        }
        if (filterMode === "risky-only") {
          return reviewer.riskyApprovals > 0;
        }
        if (filterMode === "useful-comments") {
          return reviewer.usefulnessSignals > 0;
        }
        if (filterMode === "high-risk-approvals") {
          return reviewer.highRiskApprovals > 0;
        }
        return true;
      });

      const sortedRows = filteredRows.sort((a, b) => {
        const aValue = toCountSafe(a[sortKey]);
        const bValue = toCountSafe(b[sortKey]);
        if (bValue !== aValue) {
          return bValue - aValue;
        }
        if (b.riskyApprovals !== a.riskyApprovals) {
          return b.riskyApprovals - a.riskyApprovals;
        }
        if (b.approvals !== a.approvals) {
          return b.approvals - a.approvals;
        }
        if (b.comments !== a.comments) {
          return b.comments - a.comments;
        }
        return String(a.name || a.login).localeCompare(String(b.name || b.login));
      });

      return {
        summary,
        reviewerRows: sortedRows.slice(0, topN),
        totalBeforeLimit: sortedRows.length,
        topN,
      };
    };

    return {
      normalizeRowMetrics,
      buildReviewerStats,
      applyStatsControls,
    };
  };

  return {
    createPrReviewStatsAggregationHelpers,
  };
});
