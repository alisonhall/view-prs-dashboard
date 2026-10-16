/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ApprovalRiskSection } = require('./ApprovalRiskSection');
const { createPrFormattingHelpers } = require('../../helpers/pr-formatting.helpers.js');
const { PrInsightsDisplayContext, defaultPrInsightsDisplay } = require('../../state/PrInsightsDisplayContext');

const { formatIsoDatetime } = createPrFormattingHelpers();

function renderSection(props, displayOverrides = {}) {
  return render(
    <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...displayOverrides }}>
      <ApprovalRiskSection {...props} />
    </PrInsightsDisplayContext.Provider>,
  );
}

describe('ApprovalRiskSection', () => {
  test('given no approvals, when rendering, then renders nothing', () => {
    const { container } = renderSection({ metrics: { approvals: [] }, actorsMap: {} });
    expect(container).toBeEmptyDOMElement();
  });

  test('given a risky approval, when rendering, then flags it and shows the after-approval counts', () => {
    const metrics = {
      approvals: [
        {
          login: 'alice',
          name: 'Alice',
          approvedAt: '2026-01-01',
          riskyApproval: true,
          commentCountAfterApproval: 3,
          reviewCountAfterApproval: 1,
          changeRequestCountAfterApproval: 2,
          commitCountAfterApproval: 4,
          mergeLeadMinutes: 90,
        },
      ],
    };
    renderSection({ metrics, actorsMap: {} }, { formatDurationMinutes: (v) => `${v}m` });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/risk flagged/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`approved ${formatIsoDatetime('2026-01-01').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
    expect(screen.getByText(/Comments after: 3, reviews after: 1, change requests after: 2, commits after: 4, merge lead: 90m/)).toBeInTheDocument();
  });

  test('given a non-risky approval with no merge lead, when rendering, then shows the safe label and a dash for merge lead', () => {
    const metrics = { approvals: [{ login: 'bob', approvedAt: '-', riskyApproval: false, mergeLeadMinutes: null }] };
    renderSection({ metrics, actorsMap: {} });
    expect(screen.getByText(/no later issue signal/)).toBeInTheDocument();
    expect(screen.getByText(/merge lead: -/)).toBeInTheDocument();
  });
});
