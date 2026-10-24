// Shapes of the PR data the UI reads, following
// src/schema/check-open-pr-updates.data.schema.json ($defs.prData and the
// defs it references). Grown as helpers convert to TypeScript
// (AI_MODERNIZATION_PLAN.md Phase 12B), so it lists only the fields that
// converted code reads. Every field is optional because the helpers stay
// defensive about older or partial data and test fixtures.

// A top-level PR comment ($defs.topLevelComment).
export interface PrComment {
  id?: string;
  authorLogin?: string;
  authorName?: string;
  createdAt?: string;
  body?: string;
  url?: string;
}

// A comment in a review thread ($defs.reviewThreadComment).
export interface ReviewThreadComment extends PrComment {
  state?: string;
}

export interface ReviewThread {
  id?: string;
  isResolved?: boolean;
  comments?: ReviewThreadComment[];
  participants?: string[];
}

// One entry of a PR's activity lists ($defs.activityEvent; commentEvents
// use the comment subset of the same fields).
export interface PrActivityEvent {
  sourceId?: string;
  threadId?: string;
  occurredAt?: string;
  // The event's day (YYYY-MM-DD).
  date?: string;
  actor?: string;
  type?: string;
  channel?: string;
  body?: string;
  url?: string;
  conversationResolved?: boolean;
  state?: string;
  commitOid?: string;
  messageHeadline?: string;
  messageBody?: string;
}

// A day/actor/type bucket of activityTimeline ($defs.activityTimelineBucket).
export interface PrActivityTimelineBucket {
  events?: PrActivityEvent[];
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

// A submitted review ($defs.review). `author` is the raw `gh` shape some
// older rows still carry.
export interface PrReview {
  id?: string;
  authorLogin?: string;
  authorName?: string;
  author?: { name?: string };
  state?: string;
  submittedAt?: string;
  body?: string;
  url?: string;
  commitOid?: string;
}

// A commit on the PR branch ($defs.commit).
export interface PrCommit {
  oid?: string;
  committedAt?: string;
  messageHeadline?: string;
  messageBody?: string;
  authors?: PrActor[];
}

// The user's own notes on a PR (user-state schema's `notes`).
export interface PrNotesComment {
  id?: string;
  author?: string;
  tone?: "Positive" | "Negative" | "Neutral" | "";
  note?: string;
}

export interface PrNotes {
  comments?: PrNotesComment[];
  otherNotes?: string;
  prDifficulty?: string;
  rallyStories?: string[];
  rallyLinks?: string[];
  analysisOfPr?: string;
}

// One approval as the insights script assessed it ($defs.metricsApproval).
export interface PrMetricsApproval extends PrActor {
  approvedAt?: string;
  changeRequestCountAfterApproval?: number;
  riskyApproval?: boolean;
  highRiskApproval?: boolean;
}

// The per-PR `metrics` object (insights script output). Only the fields
// converted code reads are listed.
export interface PrMetrics {
  approvals?: PrMetricsApproval[];
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
  title?: string;
  // The title with "[CHK:...]"/"[MRG:...]" markers appended.
  titleDisplay?: string;
  // The script's change status: "CHANGED", "NO_CHANGE" or "NO_ACTIVITY"
  // (older data wrote "CHANGED(<reasons>)"), and the change reasons as
  // "|"-separated tokens such as "commit|review" ("-" when none).
  status?: string;
  reason?: string;
  // The viewer's own last activity on the PR (README: "Your last
  // activity"); "" or "-" when there is none.
  baseline?: string;
  url?: string;
  author?: string;
  authorLogin?: string;
  approvers?: PrApprover[];
  assignees?: PrActor[];
  requestedReviewers?: PrActor[];
  comments?: PrComment[];
  reviews?: PrReview[];
  commits?: PrCommit[];
  // ISO timestamps, or "" while the PR is open.
  closedAt?: string;
  mergedAt?: string;
  // When the PR last changed on GitHub (ISO, or "").
  sourceUpdatedAt?: string;
  metrics?: PrMetrics;
  // Older data kept notes on the row itself; current data has them on the
  // entry (PrEntry.notes).
  notes?: PrNotes;
  labels?: PrLabel[];
  viewerLogin?: string;
  reviewThreads?: ReviewThread[];
  commentEvents?: PrActivityEvent[];
  activityEvents?: PrActivityEvent[];
  activityTimeline?: PrActivityTimelineBucket[];
  // Digits-only string in the data file.
  openConversationCount?: string | number;
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
  updatedAt?: string;
  rowOrder?: number | string;
  data?: PrData;
  // Copied from the user state onto the entry by the server when it builds
  // the /view-prs/data payload (app.js); not stored in the data file.
  notes?: PrNotes;
}

// The data file's top-level `lastRun` record (the last script run).
export interface LastRun {
  repo?: string;
  updatedAt?: string;
}

// The /view-prs/data response: the data file plus the server's additions.
// Only the fields converted code reads are listed.
export interface PrDataPayload {
  ok?: boolean;
  error?: string;
  byPrNumber?: Record<string, PrEntry>;
  lastRun?: LastRun | null;
  dataMeta?: { dataVersion?: string } | null;
  scheduler?: unknown;
  // Login -> display name for every actor seen (ActorsMap).
  actorsMap?: Record<string, string | undefined>;
  // The configured viewer login and login aliases (see deriveViewerContext).
  viewerLogin?: string;
  actorLoginAliases?: unknown;
  // Per-PR row versions, for polling deltas (see PrManifest).
  dataManifest?: PrManifest;
}

// What polling compares to find changed PRs: per PR, a version string of
// its whole entry plus where it lives.
export interface PrManifestEntry {
  rowVersion: string;
  repo: string;
  section: string;
  updatedAt: string;
}

export type PrManifest = Record<string, PrManifestEntry>;
