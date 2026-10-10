// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former buildActivityEventKey/normalizePrRootUrl/buildFallbackActivityEvents
// bodies into a DI-factory module, so ActivityEventsSection.jsx can import
// it directly instead of reading window.buildFallbackActivityEvents/
// window.buildActivityEventKey/window.normalizePrRootUrl. All three exist
// purely to feed that one component's event list, so they're grouped in
// one file. Byte-for-byte-logic-preserving move.
export const { createPrActivityEventsHelpers } = (() => {
  const createPrActivityEventsHelpers = ({ asArray } = {}) => {
    const asArraySafe =
      typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);

    const buildActivityEventKey = (event = {}) =>
      [
        String(event?.sourceId || ""),
        String(event?.occurredAt || ""),
        String(event?.actor || ""),
        String(event?.type || ""),
        String(event?.channel || ""),
      ].join("|");

    const normalizePrRootUrl = (url) => {
      const raw = String(url || "").trim();
      if (!raw) return "";

      try {
        const parsed = new URL(raw);
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString().replace(/\/$/, "");
      } catch (_error) {
        return raw.split("#")[0].split("?")[0].replace(/\/$/, "");
      }
    };

    const buildFallbackActivityEvents = (row = {}) => {
      const fallback = [];
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

      return fallback.filter((event) => String(event?.occurredAt || "").trim());
    };

    return {
      buildActivityEventKey,
      normalizePrRootUrl,
      buildFallbackActivityEvents,
    };
  };

  return {
    createPrActivityEventsHelpers,
  };
})();
