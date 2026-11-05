import type { PrEntry } from "../types/pr-data.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";

// The filter bar's "only" checkboxes, which narrow every section's rows:
// "Only PRs that need attention", and Conversations' "Resolved for you to
// check" (conversations you started that someone else resolved, until you
// confirm them). They replaced the "View scope" select (2026-11-05).

export interface PrScopeSelectionDeps {
  entryNeedsAttention?: (entry: PrEntry, attentionConfig: AttentionConfig | undefined) => boolean;
  // Threads you started that someone else resolved, not confirmed yet.
  entryHasThreadsToCheck?: (entry: PrEntry) => boolean;
  // Whether a PR is marked In review: with "Always show PRs in review",
  // it shows whatever these say.
  isInReviewEnabled?: (row: NonNullable<PrEntry["data"]>) => boolean;
}

export interface NarrowRowsInput<E extends PrEntry> {
  rows?: E[] | null;
  // PRs picked by number (the PRs filter) show whatever these say, and
  // so do PRs marked In review with "Always show PRs in review".
  picksPrs?: boolean;
  alwaysShowInReview?: boolean;
  onlyNeedsAttention?: boolean;
  onlyThreadsToCheck?: boolean;
  attentionConfig?: AttentionConfig;
}

const createPrScopeSelectionHelpers = ({ entryNeedsAttention, entryHasThreadsToCheck, isInReviewEnabled }: PrScopeSelectionDeps = {}) => {
  const entryNeedsAttentionSafe = typeof entryNeedsAttention === "function" ? entryNeedsAttention : () => false;
  const entryHasThreadsToCheckSafe = typeof entryHasThreadsToCheck === "function" ? entryHasThreadsToCheck : () => false;
  const isInReviewEnabledSafe = typeof isInReviewEnabled === "function" ? isInReviewEnabled : () => false;

  const narrowRows = <E extends PrEntry>({
    rows,
    picksPrs,
    alwaysShowInReview,
    onlyNeedsAttention,
    onlyThreadsToCheck,
    attentionConfig,
  }: NarrowRowsInput<E> = {}): E[] => {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (picksPrs || (!onlyNeedsAttention && !onlyThreadsToCheck)) return safeRows;
    return safeRows.filter(
      (entry) =>
        (alwaysShowInReview && isInReviewEnabledSafe(entry?.data || {})) ||
        ((!onlyNeedsAttention || entryNeedsAttentionSafe(entry, attentionConfig)) &&
          (!onlyThreadsToCheck || entryHasThreadsToCheckSafe(entry))),
    );
  };

  return { narrowRows };
};

export { createPrScopeSelectionHelpers };
