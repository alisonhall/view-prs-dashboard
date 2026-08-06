/** @jest-environment jsdom */

const {
  createPrReviewStatsDateBucketingHelpers,
} = require("./pr-review-stats-date-bucketing.helpers.js");

describe("review stats date bucketing helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrReviewStatsDateBucketingHelpers({
      formatDateInputValue: (date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      },
      asArray: (value) => (Array.isArray(value) ? value : []),
      toCount: (value) => Number(value) || 0,
      getNormalizedStatsDateRange: () => ({
        start: "",
        end: "",
        startDate: "",
        endDate: "",
      }),
      ...overrides,
    });

  test("given valid date input, when parsing date value, then utc date object is returned", () => {
    const { parseDateInputValue } = createHelpers();
    const date = parseDateInputValue("2026-07-15");
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  test("given invalid date input, when parsing date value, then null is returned", () => {
    const { parseDateInputValue } = createHelpers();
    expect(parseDateInputValue("07/15/2026")).toBeNull();
  });

  test("given start and end dates, when building date range values, then inclusive date list is returned", () => {
    const { buildDateRangeValues } = createHelpers();
    expect(buildDateRangeValues("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  test("given no explicit range and many dates, when getting timeline keys, then fallback window is applied", () => {
    const { getTimelineDateKeys } = createHelpers();
    const dates = Array.from({ length: 40 }, (_, idx) => {
      const day = String(idx + 1).padStart(2, "0");
      return `2026-07-${day}`;
    });

    const keys = getTimelineDateKeys(dates, {
      start: "",
      end: "",
      startDate: "",
      endDate: "",
    });

    expect(keys).toHaveLength(31);
    expect(keys[0]).toBe("2026-07-10");
    expect(keys[keys.length - 1]).toBe("2026-07-40");
  });

  test("given timeline data, when bucketing chart data, then bucket metadata and aggregated values are returned", () => {
    const { bucketTimelineChartData } = createHelpers();

    const result = bucketTimelineChartData(
      {
        dates: ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
        series: [
          {
            login: "alex",
            points: [
              { date: "2026-07-01", value: 1 },
              { date: "2026-07-02", value: 2 },
              { date: "2026-07-03", value: 3 },
              { date: "2026-07-04", value: 4 },
            ],
          },
        ],
      },
      2,
    );

    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0].title).toBe("2026-07-01 to 2026-07-02");
    expect(result.series[0].points[0].value).toBe(3);
    expect(result.series[0].points[1].value).toBe(7);
  });
});
