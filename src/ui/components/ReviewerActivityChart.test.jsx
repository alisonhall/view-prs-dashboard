/** @jest-environment jsdom */

const { render, screen, fireEvent } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewerActivityChart } = require('./ReviewerActivityChart');
const { ReviewStatsContext, defaultReviewStats } = require('../state/ReviewStatsContext');

const buildChartData = () => ({
  dates: ['2026-07-01', '2026-07-02'],
  series: [
    {
      login: 'alex',
      actor: 'Alex',
      points: [
        { label: 'Jul 1', value: 2 },
        { label: 'Jul 2', value: 4 },
      ],
    },
    {
      login: 'jamie',
      actor: 'Jamie',
      points: [
        { label: 'Jul 1', value: 1 },
        { label: 'Jul 2', value: 0 },
      ],
    },
  ],
});

// These tests exercise ReviewerActivityChart's own rendering/interaction
// behavior (legends, tooltips, hover states), not the real bucketing
// algorithm's day-grouping logic (covered separately, at the helper level)
// - so they use a simple one-bucket-per-date passthrough, the same shape
// ReviewerActivityChart.jsx itself used to fall back to before
// bucketTimelineChartData moved to useReviewStats() (Phase 7, sub-phase
// 7.0 - see REACT_MIGRATION_PLAN.md).
const passthroughBucketing = (chartData) => ({
  buckets: Array.isArray(chartData?.dates)
    ? chartData.dates.map((date) => ({
        key: String(date || ''),
        startDate: String(date || ''),
        endDate: String(date || ''),
        dates: [String(date || '')],
        dayCount: 1,
        heatmapTopLabel: '',
        heatmapBottomLabel: '',
        title: String(date || ''),
        axisLabel: String(date || ''),
        axisLabelWithTextMonth: String(date || ''),
      }))
    : [],
  series: Array.isArray(chartData?.series) ? chartData.series : [],
});

const renderChart = (props, bucketTimelineChartData = passthroughBucketing) =>
  render(
    <ReviewStatsContext.Provider value={{ ...defaultReviewStats, bucketTimelineChartData }}>
      <ReviewerActivityChart {...props} />
    </ReviewStatsContext.Provider>,
  );

describe('ReviewerActivityChart', () => {
  test('given no series, when rendering, then nothing is rendered', () => {
    const { container } = renderChart({ chartData: { series: [] } });
    expect(container).toBeEmptyDOMElement();
  });

  test('given chart data, when rendering, then one bucket per date is shown', () => {
    renderChart({ chartData: buildChartData(), titleOverride: 'Custom title', subtitleOverride: 'Custom subtitle' });

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Custom subtitle')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(document.querySelector('[title="Alex: 6 total events"]')).toBeInTheDocument();
    expect(document.querySelector('[title="Jamie: 1 total events"]')).toBeInTheDocument();
  });

  test('given default titles, when rendering, then default title/subtitle text is used', () => {
    renderChart({ chartData: buildChartData() });
    expect(screen.getByText('Activity over time per author')).toBeInTheDocument();
    expect(screen.getByText('Heatmap + line trends for top 2 authors over time.')).toBeInTheDocument();
  });

  test('given a legend button, when clicked, then it toggles selected (active) styling', async () => {
    const user = userEvent.setup();
    renderChart({ chartData: buildChartData() });

    const legendButton = screen.getByRole('button', { name: 'Alex (6)' });
    expect(legendButton).toHaveStyle({ opacity: '1' });

    await user.click(legendButton);
    expect(legendButton).toHaveStyle({ opacity: '1' });

    const jamieButton = screen.getByRole('button', { name: 'Jamie (1)' });
    expect(jamieButton).toHaveStyle({ opacity: '0.35' });

    await user.click(legendButton);
    expect(jamieButton).toHaveStyle({ opacity: '1' });
  });

  test('given a dot, when hovered, then the tooltip shows text and hides on mouse leave', () => {
    renderChart({ chartData: buildChartData() });

    // Both the heatmap cell and the line-chart dot share the same title text
    // for a given author/date - the dot is the one with a round border-radius.
    const dot = Array.from(document.querySelectorAll('[title="Alex on Jul 1: 2 events"]')).find(
      (el) => el.getAttribute('style')?.includes('border-radius: 50%'),
    );
    expect(dot).toBeTruthy();

    fireEvent.mouseEnter(dot);
    expect(screen.getByText('Alex | Jul 1 | 2')).toBeInTheDocument();

    fireEvent.mouseLeave(dot);
    const tooltip = screen.getByText('Alex | Jul 1 | 2');
    expect(tooltip).toHaveStyle({ display: 'none' });
  });

  test('given a custom bucketTimelineChartData, when rendering, then it is used for buckets', () => {
    renderChart({ chartData: buildChartData() }, () => ({
      buckets: [
        { key: 'b1', title: 'Bucket 1', dayCount: 3, heatmapTopLabel: 'B1', heatmapBottomLabel: '', axisLabel: 'X1', axisLabelWithTextMonth: 'X1' },
      ],
      series: buildChartData().series.map((series) => ({ ...series, points: [series.points[0]] })),
    }));

    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.getByText('Note: Cells represent multiple days: 3 days')).toBeInTheDocument();
  });
});
