/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ApprovalRiskSection } = require('./ApprovalRiskSection');

describe('ApprovalRiskSection', () => {
  afterEach(() => {
    delete window.asArray;
    delete window.resolveActorDisplayName;
    delete window.formatIsoDatetime;
    delete window.toCount;
    delete window.formatDurationMinutes;
  });

  test('given no approvals, when rendering, then renders nothing', () => {
    const { container } = render(<ApprovalRiskSection metrics={{ approvals: [] }} actorsMap={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given a risky approval, when rendering, then flags it and shows the after-approval counts', () => {
    window.asArray = (v) => (Array.isArray(v) ? v : []);
    window.resolveActorDisplayName = (login, _actorsMap, fallback) => fallback || login;
    window.formatIsoDatetime = (v) => `fmt(${v})`;
    window.toCount = (v) => Number(v) || 0;
    window.formatDurationMinutes = (v) => `${v}m`;

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
    render(<ApprovalRiskSection metrics={metrics} actorsMap={{}} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/risk flagged/)).toBeInTheDocument();
    expect(screen.getByText(/approved fmt\(2026-01-01\)/)).toBeInTheDocument();
    expect(screen.getByText(/Comments after: 3, reviews after: 1, change requests after: 2, commits after: 4, merge lead: 90m/)).toBeInTheDocument();
  });

  test('given a non-risky approval with no merge lead, when rendering, then shows the safe label and a dash for merge lead', () => {
    window.asArray = (v) => (Array.isArray(v) ? v : []);
    window.resolveActorDisplayName = (login) => login;
    window.formatIsoDatetime = (v) => String(v);
    window.toCount = (v) => Number(v) || 0;

    const metrics = { approvals: [{ login: 'bob', approvedAt: '-', riskyApproval: false, mergeLeadMinutes: null }] };
    render(<ApprovalRiskSection metrics={metrics} actorsMap={{}} />);
    expect(screen.getByText(/no later issue signal/)).toBeInTheDocument();
    expect(screen.getByText(/merge lead: -/)).toBeInTheDocument();
  });
});
