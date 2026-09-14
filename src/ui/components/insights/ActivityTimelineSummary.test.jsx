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

  describe('consolidating no-activity weekday runs', () => {
    beforeEach(() => {
      window.asArray = (v) => (Array.isArray(v) ? v : []);
      window.normalizeActorLogin = (v) => String(v || '').trim();
    });

    // 2026-01-05/06 are a Monday/Tuesday; 2026-01-12 is the following
    // Monday - a closed PR (isOpen=false) never extends past `newest`
    // (2026-01-12), so the walk covers exactly Mon 01-05 through Mon
    // 01-12: activity on the two bookend Mondays/Tuesday, a Wed-Fri gap,
    // and a weekend gap in between that must not appear or break the run.
    const activityTimelineRaw = [
      { date: '2026-01-12', actor: 'alice', type: 'comment', count: 1 },
      { date: '2026-01-05', actor: 'alice', type: 'comment', count: 1 },
    ];

    test('given a 3-weekday no-activity gap spanning a weekend, when rendering, then it renders as one consolidated row with the day count and date range, and no weekend row appears', () => {
      render(
        <ActivityTimelineSummary
          activityTimelineRaw={activityTimelineRaw}
          fallbackSummary=""
          isOpen={false}
          pr={{}}
          actorsMap={{}}
        />,
      );

      const table = document.querySelector('table');
      const rows = Array.from(table.querySelectorAll('tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        return { date: cells[0]?.textContent?.trim(), activity: cells[1]?.textContent?.trim() };
      });

      // Newest-first: 01-12 (activity), the consolidated 01-06..01-09 gap
      // (Tue-Fri, 4 weekdays - 01-10/11 weekend excluded and not counted),
      // then 01-05 (activity).
      expect(rows).toHaveLength(3);
      expect(rows[0].date).toBe('2026-01-12');
      expect(rows[1].date).toBe('2026-01-06 – 2026-01-09');
      expect(rows[1].activity).toBe('No activity for 4 days');
      expect(rows[2].date).toBe('2026-01-05');

      const dateTexts = rows.map((r) => r.date);
      expect(dateTexts).not.toContain('2026-01-10'); // Saturday
      expect(dateTexts).not.toContain('2026-01-11'); // Sunday
    });

    test('given a single no-activity weekday (no run to consolidate), when rendering, then it still renders its own dash row rather than a "1 day" summary', () => {
      const singleGapTimeline = [
        { date: '2026-01-06', actor: 'alice', type: 'comment', count: 1 }, // Tuesday
        { date: '2026-01-08', actor: 'alice', type: 'comment', count: 1 }, // Thursday
      ];
      render(
        <ActivityTimelineSummary
          activityTimelineRaw={singleGapTimeline}
          fallbackSummary=""
          isOpen={false}
          pr={{}}
          actorsMap={{}}
        />,
      );

      const table = document.querySelector('table');
      const rows = Array.from(table.querySelectorAll('tr')).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        return { date: cells[0]?.textContent?.trim(), activity: cells[1]?.textContent?.trim() };
      });

      // Wednesday 2026-01-07 is the lone no-activity weekday between the
      // two activity days - a gap of 1 stays a plain dash row, not a
      // "No activity for 1 days" summary.
      expect(rows).toHaveLength(3);
      expect(rows[1].date).toBe('2026-01-07');
      expect(rows[1].activity).toBe('-');
    });
  });
});
