import type { PrEntry } from "../types/pr-data.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";

// The filter bar's "only" checkboxes, which narrow every section's rows to
// the PRs each picks out (all of them, when several are checked):
// "Only PRs that need attention", and Conversations' "Open conversations
// with me", "Waiting on me" (the Review column's speech bubble, and its
// filled one) and "Resolved for you to check" (conversations you started
// that someone else resolved, until you confirm them). They replaced the
// "View scope" select (2026-11-05).

export interface PrScopeSelectionDeps {
  entryNeedsAttention?: (entry: PrEntry, attentionConfig: AttentionConfig | undefined) => boolean;
  // Unresolved threads you started or replied in.
  entryHasOpenConversationsWithMe?: (entry: PrEntry) => boolean;
  // Of those, one whose latest comment is someone else's or mentions you.
  entryHasConversationWaitingOnMe?: (entry: PrEntry) => boolean;
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
  onlyOpenConversationsWithMe?: boolean;
  onlyWaitingOnMe?: boolean;
  onlyThreadsToCheck?: boolean;
  attentionConfig?: AttentionConfig;
}

const never = () => false;

const createPrScopeSelectionHelpers = ({
  entryNeedsAttention,
  entryHasOpenConversationsWithMe,
  entryHasConversationWaitingOnMe,
  entryHasThreadsToCheck,
  isInReviewEnabled,
}: PrScopeSelectionDeps = {}) => {
  const entryNeedsAttentionSafe = typeof entryNeedsAttention === "function" ? entryNeedsAttention : never;
  const entryHasOpenConversationsWithMeSafe =
    typeof entryHasOpenConversationsWithMe === "function" ? entryHasOpenConversationsWithMe : never;
  const entryHasConversationWaitingOnMeSafe =
    typeof entryHasConversationWaitingOnMe === "function" ? entryHasConversationWaitingOnMe : never;
  const entryHasThreadsToCheckSafe = typeof entryHasThreadsToCheck === "function" ? entryHasThreadsToCheck : never;
  const isInReviewEnabledSafe = typeof isInReviewEnabled === "function" ? isInReviewEnabled : never;

  const narrowRows = <E extends PrEntry>({
    rows,
    picksPrs,
    alwaysShowInReview,
    onlyNeedsAttention,
    onlyOpenConversationsWithMe,
    onlyWaitingOnMe,
    onlyThreadsToCheck,
    attentionConfig,
  }: NarrowRowsInput<E> = {}): E[] => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const checks: Array<(entry: E) => boolean> = [
      onlyNeedsAttention && ((entry: E) => entryNeedsAttentionSafe(entry, attentionConfig)),
      onlyOpenConversationsWithMe && entryHasOpenConversationsWithMeSafe,
      onlyWaitingOnMe && entryHasConversationWaitingOnMeSafe,
      onlyThreadsToCheck && entryHasThreadsToCheckSafe,
    ].filter((check): check is (entry: E) => boolean => typeof check === "function");
    if (picksPrs || checks.length === 0) return safeRows;
    return safeRows.filter(
      (entry) =>
        (alwaysShowInReview && isInReviewEnabledSafe(entry?.data || {})) || checks.every((check) => check(entry)),
    );
  };

  return { narrowRows };
};

export { createPrScopeSelectionHelpers };
