/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptySignal, Signal, SignalGroup } from './Signal';

describe('Signal', () => {
  test('on its own: focusable, named by its first line, described by the whole label, with a tooltip on focus', async () => {
    const user = userEvent.setup();
    render(<Signal icon="checksFail" tone="danger" label={'Checks: FAIL\nAt least one check failed'} />);

    const icon = screen.getByRole('img', { name: 'Checks: FAIL' });
    const target = icon.closest('.ui-tooltip-target') as HTMLElement;
    expect(target).toHaveAttribute('tabindex', '0');
    expect(target).toHaveAccessibleDescription(/^Checks: FAIL\s+At least one check failed$/);

    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Checks: FAIL');
  });

  test('in a group: no keyboard stop and no description of its own, but a tooltip on hover', async () => {
    const user = userEvent.setup();
    render(
      <SignalGroup label="Signals" summary={['Flagged']}>
        <Signal icon="flag" tone="danger" label="Flagged" inGroup />
      </SignalGroup>,
    );

    const signal = screen.getByRole('img', { name: 'Flagged' }).closest('.ui-signal') as HTMLElement;
    expect(signal).not.toHaveAttribute('tabindex');
    expect(signal).not.toHaveAttribute('aria-describedby');
    expect(signal).toHaveAttribute('data-tip-on', 'hover');

    await user.hover(signal);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Flagged');
  });

  test('shows its short text beside the icon, hidden from screen readers (the name has it)', () => {
    render(<Signal icon="fileViewed" text="3/4" label="Viewed files: 3 of 4" />);
    expect(screen.getByText('3/4')).toHaveAttribute('aria-hidden', 'true');
  });

  test('an empty slot takes the space but says nothing', () => {
    const { container } = render(<EmptySignal />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SignalGroup', () => {
  test('is one named keyboard stop whose focus tooltip lists its summary', async () => {
    const user = userEvent.setup();
    render(
      <SignalGroup label="Signals" summary={['Changed since your last ack', 'Flagged']}>
        <Signal icon="dot" label="Changed since your last ack" inGroup />
        <Signal icon="flag" label="Flagged" inGroup />
      </SignalGroup>,
    );

    await user.tab();
    const group = screen.getByRole('group', { name: 'Signals' });
    expect(group).toHaveFocus();
    expect(group).toHaveAccessibleDescription(/^Changed since your last ack\s+Flagged$/);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Changed since your last ack\s*Flagged/);
  });

  test('opens only on focus: hovering the group\'s gaps shows nothing, hovering a signal shows that signal', async () => {
    const user = userEvent.setup();
    render(
      <SignalGroup label="Signals" summary={['Flagged']}>
        <span data-testid="gap">gap</span>
        <Signal icon="flag" label="Flagged" inGroup />
      </SignalGroup>,
    );

    await user.hover(screen.getByTestId('gap'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('with nothing to list, isn\'t a keyboard stop', () => {
    render(
      <SignalGroup label="Checks and mergeability" summary={[]}>
        <EmptySignal />
      </SignalGroup>,
    );
    expect(screen.getByRole('group', { name: 'Checks and mergeability' })).not.toHaveAttribute('tabindex');
  });
});
