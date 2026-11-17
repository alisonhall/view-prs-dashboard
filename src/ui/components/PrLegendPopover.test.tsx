/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrLegendPopover } from './PrLegendPopover';

describe('PrLegendPopover', () => {
  test("opens what the table's icons mean, column by column, and Esc closes it", async () => {
    const user = userEvent.setup();
    render(<PrLegendPopover />);
    const button = screen.getByRole('button', { name: 'Legend' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    const dialog = screen.getByRole('dialog', { name: 'What the icons mean' });
    expect(within(dialog).getAllByRole('region').map((group) => group.getAttribute('aria-label'))).toEqual([
      'Signals',
      'Pull request',
      'Review',
      'CHK·MRG (checks and mergeability)',
      'Activity',
    ]);
    const signals = within(dialog).getByRole('region', { name: 'Signals' });
    expect(signals).toHaveTextContent(/Changed since your last Ack/);
    expect(signals).toHaveTextContent(/No recent activity/);
    // Each icon's term has a name screen readers read; the blank slot says so.
    expect(within(signals).getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Blue dot',
      'Grey ring',
      '(blank)',
      'Info icon',
      'Warning icon',
      'Flag',
      'Eye',
    ]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
