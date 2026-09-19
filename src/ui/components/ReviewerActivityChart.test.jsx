/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewerActivityChart } = require('./ReviewerActivityChart');

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

describe('ReviewerActivityChart', () => {
  afterEach(() => {
    delete window.bucketTimelineChartData;
  });

  test('given no series, when rendering, then nothing is rendered', () => {
    const { container } = render(<ReviewerActivityChart chartData={{ series: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given chart data and no window.bucketTimelineChartData, when rendering, then falls back to one bucket per date', () => {
    render(<ReviewerActivityChart chartData={buildChartData()} titleOverride="Custom title" subtitleOverride="Custom subtitle" />);

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByText('Custom subtitle')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(document.querySelector('[title="Alex: 6 total events"]')).toBeInTheDocument();
    expect(document.querySelector('[title="Jamie: 1 total events"]')).toBeInTheDocument();
  });

  test('given default titles, when rendering, then default title/subtitle text is used', () => {
    render(<ReviewerActivityChart chartData={buildChartData()} />);
    expect(screen.getByText('Activity over time per author')).toBeInTheDocument();
    expect(screen.getByText('Heatmap + line trends for top 2 authors over time.')).toBeInTheDocument();
  });

  test('given a legend button, when clicked, then it toggles selected (active) styling', async () => {
    const user = userEvent.setup();
    render(<ReviewerActivityChart chartData={buildChartData()} />);

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
    render(<ReviewerActivityChart chartData={buildChartData()} />);

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

  test('given a custom window.bucketTimelineChartData, when rendering, then it is used for buckets', () => {
    window.bucketTimelineChartData = () => ({
      buckets: [
        { key: 'b1', title: 'Bucket 1', dayCount: 3, heatmapTopLabel: 'B1', heatmapBottomLabel: '', axisLabel: 'X1', axisLabelWithTextMonth: 'X1' },
      ],
      series: buildChartData().series.map((series) => ({ ...series, points: [series.points[0]] })),
    });

    render(<ReviewerActivityChart chartData={buildChartData()} />);
    expect(screen.getByText('B1')).toBeInTheDocument();
    expect(screen.getByText('Note: Cells represent multiple days: 3 days')).toBeInTheDocument();
  });
});
