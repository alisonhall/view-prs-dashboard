/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { BackfillBadges } = require('./BackfillBadges');

describe('BackfillBadges', () => {
  test('given no badges, when rendering, then nothing is rendered', () => {
    const { container } = render(<BackfillBadges badges={[]} />);
    expect(container.querySelectorAll('.scheduler-badge').length).toBe(0);
  });

  test('given several badges, when rendering, then each renders its text and className', () => {
    const { container } = render(
      <BackfillBadges
        badges={[
          { text: 'Backfill: running', className: 'scheduler-badge-running' },
          { text: 'PID 1234', className: '' },
        ]}
      />,
    );
    const badges = container.querySelectorAll('.scheduler-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toBe('Backfill: running');
    expect(badges[0].className).toBe('scheduler-badge scheduler-badge-running');
    expect(badges[1].textContent).toBe('PID 1234');
    expect(badges[1].className).toBe('scheduler-badge');
  });

  test('given a re-render with different badges, when re-rendering, then the list updates', () => {
    const { container, rerender } = render(
      <BackfillBadges badges={[{ text: 'Backfill: stopped', className: 'scheduler-badge-stopped' }]} />,
    );
    expect(container.querySelectorAll('.scheduler-badge')).toHaveLength(1);

    rerender(
      <BackfillBadges
        badges={[
          { text: 'Backfill: running', className: 'scheduler-badge-running' },
          { text: 'Status error', className: 'scheduler-badge-error' },
        ]}
      />,
    );
    const badges = container.querySelectorAll('.scheduler-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toBe('Backfill: running');
    expect(badges[1].textContent).toBe('Status error');
  });
});
