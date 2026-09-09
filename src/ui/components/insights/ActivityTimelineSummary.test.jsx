/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ActivityTimelineSummary } = require('./ActivityTimelineSummary');

describe('ActivityTimelineSummary', () => {
  afterEach(() => {
    delete window.asArray;
    delete window.getEffectiveViewerLogin;
    delete window.normalizeActorLogin;
    delete window.resolveActorDisplayName;
    delete window.buildActorIdentityClassName;
    delete window.buildActorIdentityTitle;
  });

  test('given no timeline data, when rendering, then falls back to the summary string', () => {
    render(<ActivityTimelineSummary activityTimelineRaw={[]} fallbackSummary="3 comments" isOpen pr={{}} actorsMap={{}} />);
    expect(screen.getByText('3 comments')).toBeInTheDocument();
  });

  test('given no timeline data and no fallback, when rendering, then shows a dash', () => {
    render(<ActivityTimelineSummary activityTimelineRaw={null} fallbackSummary="" isOpen pr={{}} actorsMap={{}} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  test('given timeline entries, when rendering, then renders a table with one row per date', () => {
    window.asArray = (v) => (Array.isArray(v) ? v : []);
    window.normalizeActorLogin = (v) => String(v || '').trim();

    const activityTimelineRaw = [
      { date: '2026-01-05', actor: 'alice', type: 'comment', count: 2 },
      { date: '2026-01-04', actor: 'bob', type: 'commit', count: 1 },
    ];
    render(<ActivityTimelineSummary activityTimelineRaw={activityTimelineRaw} fallbackSummary="" isOpen={false} pr={{}} actorsMap={{}} />);

    const table = document.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('2026-01-05')).toBeInTheDocument();
    expect(screen.getByText('2026-01-04')).toBeInTheDocument();
    expect(screen.getByText(/comments \(2\)/)).toBeInTheDocument();
  });
});
