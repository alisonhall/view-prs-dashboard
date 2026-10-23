// Shapes of the PR data the UI reads, following
// src/schema/check-open-pr-updates.data.schema.json ($defs.prData and the
// defs it references). Grown as helpers convert to TypeScript
// (AI_MODERNIZATION_PLAN.md Phase 12B), so it lists only the fields that
// converted code reads. Every field is optional because the helpers stay
// defensive about older or partial data and test fixtures.

export interface ReviewThreadComment {
  state?: string;
}

export interface ReviewThread {
  comments?: ReviewThreadComment[];
}

// The data file stores label names as strings; `{ name }` objects (raw
// `gh` output) are accepted too.
export type PrLabel = string | { name?: string };

// The per-PR `metrics` object (insights script output). Only the summary
// counts the insights row formats are listed.
export interface PrMetrics {
  counts?: {
    totalComments?: number;
    reviews?: number;
    approvals?: number;
  };
  conversationSummary?: {
    estimatedOpenConversations?: number;
    openThreads?: number;
    estimatedTotalConversations?: number;
    totalThreads?: number;
  };
  approvalSummary?: {
    riskyApprovals?: number;
    totalApprovals?: number;
    highRiskApprovals?: number;
  };
  commentUsefulnessSummary?: {
    usefulnessSignals?: number;
    commentsFollowedByAuthorCommit?: number;
    resolvedThreadCommentsOnOthersPrs?: number;
  };
}

export interface PrData {
  labels?: PrLabel[];
  viewerLogin?: string;
  reviewThreads?: ReviewThread[];
  viewedFilesSummary?: string;
  // Digits-only strings in the data file ($defs.numericString); numbers are
  // accepted too, since every reader coerces.
  viewedFilesCount?: string | number;
  changedFilesCount?: string | number;
}

// The data file's top-level `lastRun` record (the last script run).
export interface LastRun {
  repo?: string;
  updatedAt?: string;
}
