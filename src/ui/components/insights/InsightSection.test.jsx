/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { InsightSection } = require('./InsightSection');

describe('InsightSection', () => {
  test('given summaryText, when rendering, then renders a <details class="insight-section"> with a plain-text <summary>', () => {
    render(
      <InsightSection summaryText="Activity sequence">
        <div>body</div>
      </InsightSection>,
    );
    const details = document.querySelector('details.insight-section');
    expect(details).toBeInTheDocument();
    expect(details.querySelector('summary')).toHaveTextContent('Activity sequence');
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  test('given no explicit sectionKey, when rendering, then derives data-insight-key from the lowercased summaryText', () => {
    render(<InsightSection summaryText="Review conversations (1/2)">content</InsightSection>);
    expect(document.querySelector('details')).toHaveAttribute('data-insight-key', 'review conversations (1/2)');
  });

  test('given an explicit sectionKey, when rendering, then it takes priority over the summaryText for data-insight-key', () => {
    render(
      <InsightSection summaryText="Review conversations (1/2)" sectionKey="review-conversations">
        content
      </InsightSection>,
    );
    expect(document.querySelector('details')).toHaveAttribute('data-insight-key', 'review-conversations');
  });

  test('given summaryContent, when provided, then it renders instead of summaryText', () => {
    render(
      <InsightSection summaryText="fallback" summaryContent={<strong>rich summary</strong>}>
        content
      </InsightSection>,
    );
    expect(screen.getByText('rich summary')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  test('given a className prop, when rendering, then it is appended alongside the base insight-section class', () => {
    render(
      <InsightSection summaryText="x" className="insight-section-warning">
        content
      </InsightSection>,
    );
    expect(document.querySelector('details')).toHaveClass('insight-section', 'insight-section-warning');
  });
});
