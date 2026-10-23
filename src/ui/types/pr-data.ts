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

// A person as the data file records them ($defs.approver, and the login/
// name pair on the per-actor metrics rows).
export interface PrActor {
  login?: string;
  name?: string;
}

export interface PrApprover extends PrActor {
  approvedAt?: string;
}

// The per-PR `metrics` object (insights script output). Only the fields
// converted code reads are listed.
export interface PrMetrics {
  commentsByActor?: PrActor[];
  reviewsByActor?: PrActor[];
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
  // Digits-only string in the data file; some callers pass a number.
  number?: string | number;
  url?: string;
  author?: string;
  authorLogin?: string;
  approvers?: PrApprover[];
  metrics?: PrMetrics;
  labels?: PrLabel[];
  viewerLogin?: string;
  reviewThreads?: ReviewThread[];
  viewedFilesSummary?: string;
  // Digits-only strings in the data file ($defs.numericString); numbers are
  // accepted too, since every reader coerces.
  viewedFilesCount?: string | number;
  changedFilesCount?: string | number;
}

// One entry of the data file's top-level `byPrNumber` map ($defs.byPrEntry):
// the PR's data plus where it came from.
export interface PrEntry {
  prNumber?: string;
  repo?: string;
  section?: "open" | "draft" | "closed" | "merged";
  data?: PrData;
}

// The data file's top-level `lastRun` record (the last script run).
export interface LastRun {
  repo?: string;
  updatedAt?: string;
}
