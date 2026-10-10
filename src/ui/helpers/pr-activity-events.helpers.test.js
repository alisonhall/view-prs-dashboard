const {
  createPrActivityEventsHelpers,
} = require("./pr-activity-events.helpers.js");

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
});
