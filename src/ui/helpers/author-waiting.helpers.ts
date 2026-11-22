import type { PrEntry } from "../types/pr-data.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import { getAuthorPrState } from "./author-picker.helpers.ts";
import { isBotReviewer, measurePrReview } from "./author-stats.helpers.ts";
import { parseSortableTime } from "./pr-sortable-time.helpers.ts";

// The Authors view's "Waiting now": the selected author's open PRs (not
// drafts), each with what it's waiting on and since when, longest first.
//
// - first-review: nobody else has reviewed it yet (since it was ready).
// - changes-requested: a reviewer asked for changes and no commit has come
//   since (waiting on the author).
// - updated: commits came after the change request (waiting on the reviewer
//   to look again; since the latest of them).
// - approved: approved, with no change request outstanding, not merged.
// - reviewed: reviewed, but neither approved nor changes requested.
export type AuthorWaitingReason = "first-review" | "changes-requested" | "updated" | "approved" | "reviewed";

export interface AuthorWaitingPr {
  entry: PrEntry;
  reason: AuthorWaitingReason;
  // Since when (ms).
  since: number;
}

const max = (values: number[]) => values.filter(Number.isFinite).reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);

export const describeWaiting = (entry: PrEntry, getPreferredActorKey: GetPreferredActorKey): AuthorWaitingPr | null => {
  if (getAuthorPrState(entry) !== "open" || String(entry?.section || "").toLowerCase() === "draft") return null;
  const data = entry?.data || {};
  const { authorKey, readyAt } = measurePrReview(entry, getPreferredActorKey);

  // Each other person's latest decisive review (an approval or change
  // request; a dismissal clears theirs), and when anyone last reviewed.
  const latestDecision = new Map<string, { state: string; at: number }>();
  let lastReviewAt = Number.NEGATIVE_INFINITY;
  (Array.isArray(data.reviews) ? data.reviews : [])
    .map((review) => ({ review, at: parseSortableTime(review?.submittedAt) }))
    .filter(({ at }) => Number.isFinite(at))
    .sort((a, b) => a.at - b.at)
    .forEach(({ review, at }) => {
      const key = String(getPreferredActorKey(review?.authorLogin, review?.authorName) || "");
      if (!key || key === authorKey || isBotReviewer(review?.authorLogin, review?.authorName)) return;
      lastReviewAt = Math.max(lastReviewAt, at);
      const state = String(review?.state || "").toUpperCase();
      if (state === "APPROVED" || state === "CHANGES_REQUESTED") latestDecision.set(key, { state, at });
      else if (state === "DISMISSED") latestDecision.delete(key);
    });

  if (!Number.isFinite(lastReviewAt)) {
    return Number.isFinite(readyAt) ? { entry, reason: "first-review", since: readyAt } : null;
  }
  const decisions = [...latestDecision.values()];
  const changesAt = max(decisions.filter((d) => d.state === "CHANGES_REQUESTED").map((d) => d.at));
  if (Number.isFinite(changesAt)) {
    const commitTimes = (Array.isArray(data.commits) ? data.commits : []).map((commit) => parseSortableTime(commit?.committedAt));
    const lastCommitAfter = max(commitTimes.filter((at) => at > changesAt));
    return Number.isFinite(lastCommitAfter)
      ? { entry, reason: "updated", since: lastCommitAfter }
      : { entry, reason: "changes-requested", since: changesAt };
  }
  const approvedAt = max(decisions.filter((d) => d.state === "APPROVED").map((d) => d.at));
  if (Number.isFinite(approvedAt)) return { entry, reason: "approved", since: approvedAt };
  return { entry, reason: "reviewed", since: lastReviewAt };
};

export const buildAuthorWaitingPrs = (
  entries: Iterable<PrEntry>,
  authorKey: string,
  getPreferredActorKey: GetPreferredActorKey,
): AuthorWaitingPr[] => {
  const waiting: AuthorWaitingPr[] = [];
  for (const entry of entries) {
    const data = entry?.data || {};
    if (getPreferredActorKey(data.authorLogin, data.author) !== authorKey) continue;
    const described = describeWaiting(entry, getPreferredActorKey);
    if (described) waiting.push(described);
  }
  return waiting.sort((a, b) => a.since - b.since);
};
