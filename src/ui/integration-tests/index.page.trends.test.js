const { __testables } = require("../index.page.js");

const { aggregateReviewerActivityTimeline } = __testables;
const NO_DATE_FILTER = {
  start: "",
  end: "",
  startDate: "",
  endDate: "",
};

const buildBaseRows = () => [
  {
    data: {
      commentEvents: [
        {
          date: "2025-01-01",
          actor: "alice",
          channel: "thread",
          body: "test",
        },
        {
          date: "2025-01-02",
          actor: "bob",
          channel: "thread",
          body: "test",
        },
        {
          date: "2025-01-02",
          actor: "alice",
          channel: "thread",
          body: "test",
        },
      ],
      reviews: [
        { submittedAt: "2025-01-03T10:00:00Z", authorLogin: "alice" },
        { submittedAt: "2025-01-03T11:00:00Z", authorLogin: "charlie" },
      ],
    },
  },
];

describe("ui per-author trends", () => {
  describe("aggregateReviewerActivityTimeline", () => {
    test("returns sorted unique dates", () => {
      const result = aggregateReviewerActivityTimeline(
        buildBaseRows(),
        {},
        NO_DATE_FILTER,
      );
      expect(result.dates).toEqual(
        expect.arrayContaining(["2025-01-01", "2025-01-02", "2025-01-03"]),
      );
      expect(result.dates).toHaveLength(3);
    });

    test("includes reviewer series with login and actor fields", () => {
      const result = aggregateReviewerActivityTimeline(
        buildBaseRows(),
        {},
        NO_DATE_FILTER,
      );
      const alice = result.series.find((s) => s.login === "alice");
      const bob = result.series.find((s) => s.login === "bob");
      const charlie = result.series.find((s) => s.login === "charlie");

      expect(alice).toBeDefined();
      expect(bob).toBeDefined();
      expect(charlie).toBeDefined();
      expect(alice.actor).toBe("alice");
      expect(bob.actor).toBe("bob");
    });

    test("orders reviewers by total activity descending", () => {
      const result = aggregateReviewerActivityTimeline(
        buildBaseRows(),
        {},
        NO_DATE_FILTER,
      );
      const logins = result.series.map((s) => s.login);

      // alice should be first (4 activities: 3 comments + 1 review)
      // bob should be second (1 comment)
      // charlie should be third (1 review)
      expect(logins[0]).toBe("alice");
      expect(logins).toContain("bob");
      expect(logins).toContain("charlie");
    });

    test("fills missing reviewer dates with zero values", () => {
      const result = aggregateReviewerActivityTimeline(
        buildBaseRows(),
        {},
        NO_DATE_FILTER,
      );
      const bob = result.series.find((s) => s.login === "bob");
      expect(bob.points).toHaveLength(3);
      expect(bob.points.map((p) => p.value)).toEqual([0, 1, 0]);
    });

    test("counts only thread and top-level comment channels", () => {
      const rows = buildBaseRows();
      rows[0].data.commentEvents.push({
        date: "2025-01-02",
        actor: "alice",
        channel: "other",
        body: "ignored",
      });

      const result = aggregateReviewerActivityTimeline(
        rows,
        {},
        NO_DATE_FILTER,
      );
      const alice = result.series.find((s) => s.login === "alice");
      const aliceTotal = alice.points.reduce(
        (sum, point) => sum + point.value,
        0,
      );
      expect(aliceTotal).toBe(3); // 2 valid comments + 1 review
    });

    test("limits output to the current reviewer cap", () => {
      const rows = [
        {
          data: {
            commentEvents: [
              { date: "2025-01-01", actor: "u1", channel: "thread" },
              { date: "2025-01-01", actor: "u2", channel: "thread" },
              { date: "2025-01-01", actor: "u3", channel: "thread" },
              { date: "2025-01-01", actor: "u4", channel: "thread" },
              { date: "2025-01-01", actor: "u5", channel: "thread" },
              { date: "2025-01-01", actor: "u6", channel: "thread" },
              { date: "2025-01-01", actor: "u7", channel: "thread" },
            ],
            reviews: [],
          },
        },
      ];

      const result = aggregateReviewerActivityTimeline(
        rows,
        {},
        NO_DATE_FILTER,
      );
      expect(result.series.length).toBe(7);
    });

    test("returns empty series for null input", () => {
      const result = aggregateReviewerActivityTimeline(null, {});
      expect(result.dates).toEqual([]);
      expect(result.series).toEqual([]);
    });

    test("returns empty series for empty input", () => {
      const result = aggregateReviewerActivityTimeline([], {});
      expect(result.dates).toEqual([]);
      expect(result.series).toEqual([]);
    });

    test("applies a start date filter to hide older activity", () => {
      const result = aggregateReviewerActivityTimeline(
        buildBaseRows(),
        {},
        {
          start: "2025-01-02",
          end: "",
          startDate: "2025-01-02",
          endDate: "",
        },
      );

      expect(result.dates).toEqual(["2025-01-02", "2025-01-03"]);
      const alice = result.series.find((item) => item.login === "alice");
      expect(alice.points.map((point) => point.value)).toEqual([1, 1]);
    });
  });
});
