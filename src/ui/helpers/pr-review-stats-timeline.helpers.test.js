/** @jest-environment jsdom */

const {
  createPrReviewStatsTimelineHelpers,
} = require("./pr-review-stats-timeline.helpers.js");

describe("review stats timeline helpers", () => {
  const createHelpers = () =>
    createPrReviewStatsTimelineHelpers({
      asArray: (value) => (Array.isArray(value) ? value : []),
      getPreferredActorKey: (login, fallback) => String(login || fallback || "").trim(),
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      isWithinStatsDateRange: (iso, range) => {
        const normalized = String(iso || "").trim();
        const dateOnly = normalized.split("T")[0];
        const start = String(range?.startDate || "").trim();
        const end = String(range?.endDate || "").trim();
        if (start && dateOnly < start) return false;
        if (end && dateOnly > end) return false;
        return true;
      },
      resolveActorDisplayName: (login, _actorsMap, fallback) =>
        String(fallback || login || "").trim(),
      getTimelineDateKeys: (dates) =>
        Array.from(
          new Set(
            (Array.isArray(dates) ? dates : [])
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        ).sort(),
    });

  test("given mixed comments and reviews, when aggregating reviewer activity timeline, then grouped reviewer totals are returned", () => {
    const { aggregateReviewerActivityTimeline } = createHelpers();

    const result = aggregateReviewerActivityTimeline(
      [
        {
          data: {
            authorLogin: "pr-author",
            commentEvents: [
              { date: "2026-07-01", actor: "reviewer-a", channel: "thread" },
              { date: "2026-07-01", actor: "reviewer-a", channel: "top-level" },
              { date: "2026-07-02", actor: "reviewer-b", channel: "thread" },
            ],
            reviews: [
              { submittedAt: "2026-07-03T10:00:00Z", authorLogin: "reviewer-a" },
            ],
          },
        },
      ],
      {},
      { startDate: "", endDate: "" },
    );

    expect(result.dates).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    const reviewerA = result.series.find((item) => item.login === "reviewer-a");
    expect(reviewerA).toBeTruthy();
    expect(reviewerA.points.map((point) => point.value)).toEqual([2, 0, 1]);
  });

  test("given copilot and self-author events, when aggregating reviewer activity timeline, then excluded events are not counted", () => {
    const { aggregateReviewerActivityTimeline } = createHelpers();

    const result = aggregateReviewerActivityTimeline(
      [
        {
          data: {
            authorLogin: "reviewer-a",
            commentEvents: [
              { date: "2026-07-01", actor: "reviewer-a", channel: "thread" },
              { date: "2026-07-01", actor: "github-copilot[bot]", channel: "thread" },
              { date: "2026-07-02", actor: "reviewer-b", channel: "thread" },
            ],
            reviews: [],
          },
        },
      ],
      {},
      { startDate: "", endDate: "" },
    );

    expect(result.dates).toEqual(["2026-07-02"]);
    expect(result.series.map((item) => item.login)).toEqual(["reviewer-b"]);
  });

  test("given mixed review states, when aggregating approvals timeline, then only approved reviews are counted", () => {
    const { aggregateReviewerApprovalsTimeline } = createHelpers();

    const result = aggregateReviewerApprovalsTimeline(
      [
        {
          data: {
            authorLogin: "pr-author",
            reviews: [
              {
                submittedAt: "2026-07-03T10:00:00Z",
                authorLogin: "reviewer-a",
                state: "APPROVED",
              },
              {
                submittedAt: "2026-07-03T11:00:00Z",
                authorLogin: "reviewer-a",
                state: "COMMENTED",
              },
              {
                submittedAt: "2026-07-04T10:00:00Z",
                authorLogin: "reviewer-b",
                state: "APPROVED",
              },
            ],
          },
        },
      ],
      {},
      { startDate: "", endDate: "" },
    );

    expect(result.dates).toEqual(["2026-07-03", "2026-07-04"]);
    const reviewerA = result.series.find((item) => item.login === "reviewer-a");
    expect(reviewerA.points.map((point) => point.value)).toEqual([1, 0]);
  });
});
