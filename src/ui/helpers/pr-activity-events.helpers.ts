import type { PrActivityEvent, PrData } from "../types/pr-data.ts";

// Event-list helpers for ActivityEventsSection and the row summary: a
// dedupe key per event, a PR URL without hash/query, a fallback event list
// built from a PR's comments, threads, reviews, commits and merge/close
// time when it has no activity events of its own, and the deduplicated
// feed built from those.
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

  // The activity feed, newest first (at most 60): the timeline's events
  // (else the PR's activityEvents), each filled in from the matching
  // fallback event where it lacks a body, link, state or commit message;
  // the fallback list itself when there are none.
  const buildActivityEvents = (row: PrData = {}): PrActivityEvent[] => {
    const timelineEvents = asArraySafe(row.activityTimeline).flatMap((bucket) => asArraySafe(bucket?.events));
    const sourceEvents = timelineEvents.length ? timelineEvents : asArraySafe(row.activityEvents);
    const fallbackEvents = buildFallbackActivityEvents(row);
    const fallbackByKey = new Map(fallbackEvents.map((event) => [buildActivityEventKey(event), event]));
    const fallbackBySourceId = new Map(
      fallbackEvents.filter((event) => String(event?.sourceId || "").trim()).map((event) => [String(event.sourceId), event]),
    );
    const enrichedSourceEvents = sourceEvents.map((event) => {
      const sourceId = String(event?.sourceId || "").trim();
      const fallback = (sourceId ? fallbackBySourceId.get(sourceId) : null) || fallbackByKey.get(buildActivityEventKey(event));
      if (!fallback) return event;
      return {
        ...event,
        body: String(event?.body || "").trim() || String(fallback?.body || ""),
        url: String(event?.url || "").trim() || String(fallback?.url || ""),
        state: String(event?.state || "").trim() || String(fallback?.state || ""),
        messageHeadline: String(event?.messageHeadline || "").trim() || String(fallback?.messageHeadline || ""),
        messageBody: String(event?.messageBody || "").trim() || String(fallback?.messageBody || ""),
        conversationResolved:
          event?.conversationResolved !== undefined ? event.conversationResolved : fallback?.conversationResolved,
      };
    });
    const preDedupeEvents: PrActivityEvent[] = (enrichedSourceEvents.length ? enrichedSourceEvents : fallbackEvents).slice();

    // A COMMENTED review event whose body was backfilled from its first
    // thread comment duplicates the thread comment event. Suppress
    // review(COMMENTED) events that match a thread/top-level comment by
    // actor + minute + body.
    const signatureOf = (event: PrActivityEvent) =>
      `${String(event?.actor || "")}|${String(event?.occurredAt || "").slice(0, 16)}|${String(event?.body || "").trim()}`;
    const isCommentChannel = (event: PrActivityEvent) =>
      String(event?.channel || "") === "thread" || String(event?.channel || "") === "top-level";
    const threadCommentSignatures = new Set(
      preDedupeEvents.filter((event) => isCommentChannel(event) && String(event?.body || "").trim()).map(signatureOf),
    );

    const seen = new Set<string>();
    return preDedupeEvents
      .filter((event) => {
        if (String(event?.channel || "") !== "review" || !String(event?.body || "").trim()) return true;
        return !threadCommentSignatures.has(signatureOf(event));
      })
      .filter((event) => {
        if (!isCommentChannel(event)) return true;
        const body = String(event?.body || "").trim();
        if (!body) return true;
        const signature = `${String(event?.channel || "")}|${String(event?.occurredAt || "").slice(0, 16)}|${body}`;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      })
      .sort((a, b) => String(b?.occurredAt || "").localeCompare(String(a?.occurredAt || "")))
      .slice(0, 60);
  };

  return {
    buildActivityEventKey,
    normalizePrRootUrl,
    buildFallbackActivityEvents,
    buildActivityEvents,
  };
};

export { createPrActivityEventsHelpers };
