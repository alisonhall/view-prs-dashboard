// How each Review stats number is counted: the tooltips on the cards and
// the table's column headings (ReviewStatsContent), and the README's
// "How Review stats counts" list, which repeats them word for word (its
// test checks). Worked out by buildReviewerStats
// (pr-review-stats-aggregation.helpers.ts) from each PR's comments,
// reviews and approvals, the approvals' risk coming from the script
// (compute-pr-row.js). Everything counts only what falls between the
// Start and End dates, and with Reviewers picked, only their activity.

export const REVIEW_STATS_CARD_EXPLANATIONS = {
  prs: 'Stored PRs the numbers come from: with dates set, those with a comment, review, approval or open review thread in them; with no dates, every stored PR. With Reviewers picked, only the PRs they commented on, reviewed or approved, or have an open review thread they commented in.',
  commentsOnOthersPrs: "Comments on PRs by anyone but the PR's author, top-level and in review threads.",
  approvals:
    'Approvals of PRs. Risky: the PR got a comment, review, change request or commit after the approval. High-risk: a change request after it, or 3 or more of those.',
  usefulness:
    "Signs that comments on others' PRs were acted on, one point each: the comment's thread was resolved, the PR's author committed after it, and did so within 24 hours - up to 3 per comment.",
} as const;

// Reviewer, then each column of REVIEW_STATS_COLUMN_CATALOG
// (review-stats-columns.helpers.ts), which takes its explanation from here.
export const REVIEW_STATS_COLUMN_EXPLANATIONS = {
  reviewer: "Anyone who commented on, reviewed or approved someone else's PR.",
  comments: "Their comments on others' PRs, top-level and in review threads.",
  threadComments: 'Of those, the ones in review threads (on lines of code).',
  reviews: "Reviews they submitted on others' PRs, whatever the outcome: approved, commented, changes requested or dismissed.",
  approvals: 'Their reviews that approved.',
  riskyApprovals: 'Their approvals after which the PR got a comment, review, change request or commit.',
  highRiskApprovals: 'Their approvals followed by a change request, or by 3 or more comments, reviews, change requests and commits.',
  usefulnessSignals:
    "Their comments' points, one each: the thread was resolved, the PR's author committed after it, and within 24 hours - up to 3 per comment.",
  commentsFollowedByAuthorCommit: "Their comments the PR's author committed after.",
  resolvedThreadComments: 'Their comments in review threads that are now resolved.',
  prCount: "Others' PRs they commented on, reviewed or approved.",
  sources: 'The PRs behind their numbers.',
} as const;
