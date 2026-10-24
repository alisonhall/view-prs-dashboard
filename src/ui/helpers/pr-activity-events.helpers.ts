import type { PrActivityEvent, PrData } from "../types/pr-data.ts";

// Event-list helpers for ActivityEventsSection: a dedupe key per event, a
// PR URL without hash/query, and a fallback event list built from a PR's
// comments, threads, reviews, commits and merge/close time when it has no
// activity events of its own.
export interface PrActivityEventsDeps {
  asArray?: (value: unknown) => unknown[];
}

export interface FallbackActivityEvent extends PrActivityEvent {
  sourceId: string;
  occurredAt: string;
  actor: string;
  type: string;
  channel: string;
}

const createPrActivityEventsHelpers = ({ asArray }: PrActivityEventsDeps = {}) => {
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];

  const buildActivityEventKey = (event: PrActivityEvent | null | undefined = {}): string =>
    [
      String(event?.sourceId || ""),
      String(event?.occurredAt || ""),
      String(event?.actor || ""),
      String(event?.type || ""),
      String(event?.channel || ""),
    ].join("|");

  const normalizePrRootUrl = (url: unknown): string => {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      parsed.search = "";
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      return (raw.split("#")[0] ?? "").split("?")[0]?.replace(/\/$/, "") ?? "";
    }
  };

  const buildFallbackActivityEvents = (row: PrData = {}): FallbackActivityEvent[] => {
    const fallback: FallbackActivityEvent[] = [];
    const explicitCommentEvents = asArraySafe(row.commentEvents);

    explicitCommentEvents.forEach((event) => {
      fallback.push({
        ...event,
        type: String(event?.type || "comment"),
        channel: String(event?.channel || "top-level"),
        sourceId: String(event?.sourceId || ""),
        occurredAt: String(event?.occurredAt || ""),
        actor: String(event?.actor || "unknown"),
        body: String(event?.body || ""),
        url: String(event?.url || ""),
      });
    });

    if (!explicitCommentEvents.length) {
      asArraySafe(row.comments).forEach((comment) => {
        fallback.push({
          sourceId: String(comment?.id || ""),
          occurredAt: String(comment?.createdAt || ""),
          actor: String(comment?.authorLogin || "unknown"),
          type: "comment",
          channel: "top-level",
          body: String(comment?.body || ""),
          url: String(comment?.url || ""),
        });
      });

      asArraySafe(row.reviewThreads).forEach((thread) => {
        asArraySafe(thread?.comments).forEach((comment) => {
          fallback.push({
            sourceId: String(comment?.id || ""),
            threadId: String(thread?.id || ""),
            occurredAt: String(comment?.createdAt || ""),
            actor: String(comment?.authorLogin || "unknown"),
            type: "comment",
            channel: "thread",
            body: String(comment?.body || ""),
            url: String(comment?.url || ""),
            conversationResolved: thread?.isResolved,
          });
        });
      });
    }

    asArraySafe(row.reviews).forEach((review) => {
      const state = String(review?.state || "");
      fallback.push({
        sourceId: String(review?.id || ""),
        occurredAt: String(review?.submittedAt || ""),
        actor: String(review?.authorLogin || "unknown"),
        type: state === "APPROVED" ? "approval" : "review",
        channel: "review",
        state,
        body: String(review?.body || ""),
        url: String(review?.url || ""),
        commitOid: String(review?.commitOid || ""),
      });
    });

    asArraySafe(row.commits).forEach((commit) => {
      asArraySafe(commit?.authors).forEach((author) => {
        const authorLogin = String(author?.login || "");
        if (!authorLogin) return;
        fallback.push({
          sourceId: String(commit?.oid || ""),
          occurredAt: String(commit?.committedAt || ""),
          actor: authorLogin,
          type: "commit",
          channel: "commit",
          messageHeadline: String(commit?.messageHeadline || ""),
          messageBody: String(commit?.messageBody || ""),
        });
      });
    });

    const mergedAt = String(row?.mergedAt || "");
    if (mergedAt) {
      fallback.push({
        sourceId: "merged",
        occurredAt: mergedAt,
        actor: "unknown",
        type: "merged",
        channel: "system",
        url: String(row?.url || ""),
      });
    }

    const closedAt = String(row?.closedAt || "");
    if (closedAt && !mergedAt) {
      fallback.push({
        sourceId: "closed",
        occurredAt: closedAt,
        actor: "unknown",
        type: "closed",
        channel: "system",
        url: String(row?.url || ""),
      });
    }

    return fallback.filter((event) => String(event?.occurredAt || "").trim());
  };

  return {
    buildActivityEventKey,
    normalizePrRootUrl,
    buildFallbackActivityEvents,
  };
};

export { createPrActivityEventsHelpers };
