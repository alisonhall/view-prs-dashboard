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

export interface PrData {
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
