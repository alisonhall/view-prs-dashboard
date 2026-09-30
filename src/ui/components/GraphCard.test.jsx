/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { GraphCard } = require('./GraphCard');

describe('GraphCard', () => {
  test('given empty items, when rendering, then nothing is rendered', () => {
    const { container } = render(<GraphCard title="Empty" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given simple items, when rendering, then title/subtitle/label/value/detail render', () => {
    render(
      <GraphCard
        title="Top reviewers by comments"
        subtitle="Comments on others' PRs"
        items={[{ label: 'Alex', value: 4, tone: 'comments', detail: '2 thread comments | 3 PRs' }]}
      />,
    );

    expect(screen.getByText('Top reviewers by comments')).toBeInTheDocument();
    expect(screen.getByText("Comments on others' PRs")).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2 thread comments | 3 PRs')).toBeInTheDocument();
  });

  test('given stacked-segment items, when rendering, then one fill per segment with the summed total shown', () => {
    render(
      <GraphCard
        title="Top reviewers by comments"
        items={[
          {
            label: 'Alex',
            segments: [
              { label: 'Comments', value: 2, tone: 'comments' },
              { label: 'Reviews', value: 3, tone: 'reviews' },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(document.querySelectorAll('.stats-graph-fill-segment')).toHaveLength(2);
  });

  test('given onHeaderClick, when the title is clicked, then it fires and the title gets the clickable class', () => {
    const onHeaderClick = jest.fn();
    render(<GraphCard title="Top reviewers by comments" items={[{ label: 'Alex', value: 1 }]} onHeaderClick={onHeaderClick} />);

    const heading = screen.getByText('Top reviewers by comments');
    expect(heading.className).toContain('stats-graph-title-clickable');
    heading.click();
    expect(onHeaderClick).toHaveBeenCalledTimes(1);
  });

  test('given no onHeaderClick, when rendering, then the title has no clickable class', () => {
    render(<GraphCard title="Top reviewers by comments" items={[{ label: 'Alex', value: 1 }]} />);
    expect(screen.getByText('Top reviewers by comments').className).not.toContain('stats-graph-title-clickable');
  });
});
