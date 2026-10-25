const {
  createPrActivityEventsHelpers,
} = require("./pr-activity-events.helpers.ts");

describe("pr activity events helpers", () => {
  describe("buildActivityEventKey", () => {
    test("given an event, when building a key, then it joins the identifying fields with pipes", () => {
      const { buildActivityEventKey } = createPrActivityEventsHelpers();

      expect(
        buildActivityEventKey({
          sourceId: "1",
          occurredAt: "2026-01-01T00:00:00Z",
          actor: "alice",
          type: "comment",
          channel: "top-level",
        }),
      ).toBe("1|2026-01-01T00:00:00Z|alice|comment|top-level");
    });

    test("given a missing event, when building a key, then empty strings are used for every field", () => {
      const { buildActivityEventKey } = createPrActivityEventsHelpers();

      expect(buildActivityEventKey()).toBe("||||");
    });
  });

  describe("normalizePrRootUrl", () => {
    test("given a URL with a hash and query string, when normalizing, then both are stripped and the trailing slash is removed", () => {
      const { normalizePrRootUrl } = createPrActivityEventsHelpers();

      expect(normalizePrRootUrl("https://example.com/pr/1/?foo=bar#comment-1")).toBe(
        "https://example.com/pr/1",
      );
    });

    test("given an unparseable URL, when normalizing, then it falls back to a plain string strip", () => {
      const { normalizePrRootUrl } = createPrActivityEventsHelpers();

      expect(normalizePrRootUrl("not a url#frag?query")).toBe("not a url");
    });

    test("given no URL, when normalizing, then an empty string is returned", () => {
      const { normalizePrRootUrl } = createPrActivityEventsHelpers();

      expect(normalizePrRootUrl("")).toBe("");
    });
  });

  describe("buildFallbackActivityEvents", () => {
    test("given explicit commentEvents, when building fallback events, then they are normalized and returned", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        commentEvents: [{ sourceId: "1", occurredAt: "2026-01-01" }],
      });

      expect(result).toEqual([
        expect.objectContaining({
          sourceId: "1",
          occurredAt: "2026-01-01",
          type: "comment",
          channel: "top-level",
          actor: "unknown",
        }),
      ]);
    });

    test("given no commentEvents, when building fallback events, then comments and review-thread comments are used instead", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        comments: [{ id: "c1", createdAt: "2026-01-01", authorLogin: "alice" }],
        reviewThreads: [
          { id: "t1", comments: [{ id: "c2", createdAt: "2026-01-02", authorLogin: "bob" }] },
        ],
      });

      expect(result).toEqual([
        expect.objectContaining({ sourceId: "c1", channel: "top-level", actor: "alice" }),
        expect.objectContaining({ sourceId: "c2", channel: "thread", actor: "bob" }),
      ]);
    });

    test("given reviews, commits, and a mergedAt, when building fallback events, then all are included", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        reviews: [{ id: "r1", submittedAt: "2026-01-01", state: "APPROVED" }],
        commits: [
          { oid: "abc", committedAt: "2026-01-02", authors: [{ login: "carol" }] },
        ],
        mergedAt: "2026-01-03",
        url: "https://example.com/pr/1",
      });

      expect(result).toEqual([
        expect.objectContaining({ sourceId: "r1", type: "approval", channel: "review" }),
        expect.objectContaining({ sourceId: "abc", type: "commit", actor: "carol" }),
        expect.objectContaining({ sourceId: "merged", type: "merged", channel: "system" }),
      ]);
    });

    test("given a closedAt with no mergedAt, when building fallback events, then a 'closed' system event is included", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        closedAt: "2026-01-05",
        url: "https://example.com/pr/1",
      });

      expect(result).toEqual([
        expect.objectContaining({ sourceId: "closed", type: "closed", actor: "unknown", channel: "system" }),
      ]);
    });

    test("given both closedAt and mergedAt (a merged PR), when building fallback events, then no 'closed' event is added", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        closedAt: "2026-01-05",
        mergedAt: "2026-01-05",
      });

      expect(result.filter((event) => event.type === "closed")).toHaveLength(0);
      expect(result.filter((event) => event.type === "merged")).toHaveLength(1);
    });

    test("given an event with no occurredAt, when building fallback events, then it is filtered out", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      const result = buildFallbackActivityEvents({
        commentEvents: [{ sourceId: "1", occurredAt: "" }],
      });

      expect(result).toEqual([]);
    });

    test("given no row, when building fallback events, then it returns an empty array without throwing", () => {
      const { buildFallbackActivityEvents } = createPrActivityEventsHelpers();

      expect(buildFallbackActivityEvents()).toEqual([]);
    });
  });

  describe("buildActivityEvents", () => {
    const { buildActivityEvents } = createPrActivityEventsHelpers();

    test("given timeline events, when building the feed, then they come newest first", () => {
      const events = buildActivityEvents({
        activityTimeline: [
          { events: [{ sourceId: "a", occurredAt: "2026-01-01T10:00:00Z", actor: "alice", type: "commit", channel: "commit" }] },
          { events: [{ sourceId: "b", occurredAt: "2026-01-03T10:00:00Z", actor: "bob", type: "comment", channel: "top-level" }] },
        ],
        activityEvents: [{ sourceId: "ignored", occurredAt: "2026-02-01T00:00:00Z" }],
      });

      expect(events.map((event) => event.sourceId)).toEqual(["b", "a"]);
    });

    test("given no timeline, when building the feed, then activityEvents are used, filled in from the matching fallback event", () => {
      const [event] = buildActivityEvents({
        activityEvents: [{ sourceId: "c1", occurredAt: "2026-01-01T10:00:00Z", actor: "alice", type: "comment", channel: "top-level" }],
        comments: [{ id: "c1", createdAt: "2026-01-01T10:00:00Z", authorLogin: "alice", body: "Looks good", url: "https://x/1" }],
      });

      expect(event).toMatchObject({ sourceId: "c1", body: "Looks good", url: "https://x/1" });
    });

    test("given no activity lists at all, when building the feed, then it is the fallback list", () => {
      const events = buildActivityEvents({
        reviews: [{ id: "r1", submittedAt: "2026-01-02T00:00:00Z", authorLogin: "bob", state: "APPROVED" }],
      });

      expect(events).toEqual([expect.objectContaining({ sourceId: "r1", type: "approval" })]);
    });

    test("given a COMMENTED review repeating a thread comment (same actor, minute and body), when building the feed, then the review is dropped", () => {
      const events = buildActivityEvents({
        activityEvents: [
          { sourceId: "t1", occurredAt: "2026-01-01T10:00:05Z", actor: "alice", type: "comment", channel: "thread", body: "Nit" },
          { sourceId: "r1", occurredAt: "2026-01-01T10:00:40Z", actor: "alice", type: "review", channel: "review", body: "Nit" },
        ],
      });

      expect(events.map((event) => event.sourceId)).toEqual(["t1"]);
    });

    test("given the same comment twice in one minute, when building the feed, then it appears once", () => {
      const events = buildActivityEvents({
        activityEvents: [
          { sourceId: "x1", occurredAt: "2026-01-01T10:00:05Z", actor: "alice", type: "comment", channel: "top-level", body: "Hi" },
          { sourceId: "x2", occurredAt: "2026-01-01T10:00:30Z", actor: "alice", type: "comment", channel: "top-level", body: "Hi" },
        ],
      });

      expect(events).toHaveLength(1);
    });

    test("given more than 60 events, when building the feed, then the newest 60 are kept", () => {
      const activityEvents = Array.from({ length: 65 }, (_, index) => ({
        sourceId: `e${index}`,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 10, index)).toISOString(),
        actor: "alice",
        type: "commit",
        channel: "commit",
      }));

      const events = buildActivityEvents({ activityEvents });

      expect(events).toHaveLength(60);
      expect(events[0].sourceId).toBe("e64");
    });
  });
});
