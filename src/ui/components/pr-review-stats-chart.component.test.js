/** @jest-environment jsdom */

const {
  createPrReviewStatsChartComponent,
} = require("./pr-review-stats-chart.component.js");

describe("review stats chart component", () => {
  test("given empty chart series, when createReviewerActivityChart is called, then null is returned", () => {
    const { createReviewerActivityChart } = createPrReviewStatsChartComponent({
      bucketTimelineChartData: () => ({ buckets: [], series: [] }),
    });

    const result = createReviewerActivityChart({ series: [] });
    expect(result).toBeNull();
  });

  test("given chart data, when createReviewerActivityChart is called, then a chart card is rendered", () => {
    const { createReviewerActivityChart } = createPrReviewStatsChartComponent({
      bucketTimelineChartData: (chartData) => ({
        buckets: [
          {
            key: "2026-07-01",
            startDate: "2026-07-01",
            endDate: "2026-07-01",
            dates: ["2026-07-01"],
            dayCount: 1,
            heatmapTopLabel: "07 /",
            heatmapBottomLabel: "01",
            title: "2026-07-01",
            axisLabel: "7/1",
            axisLabelWithTextMonth: "Jul / 1",
          },
        ],
        series: chartData.series,
      }),
    });

    const card = createReviewerActivityChart(
      {
        dates: ["2026-07-01"],
        series: [
          {
            login: "alex",
            actor: "Alex",
            points: [{ label: "2026-07-01", value: 2 }],
          },
        ],
      },
      "Comments and reviews over time per author",
      "Subtitle",
    );

    expect(card).toBeTruthy();
    expect(card.className).toContain("stats-graph-card-fullwidth");
    expect(card.textContent).toContain("Comments and reviews over time per author");
    expect(card.textContent).toContain("Subtitle");
    expect(card.textContent).toContain("Line graph comparison");
  });
});
