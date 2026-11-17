/** @jest-environment jsdom */

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, ChipGroup } from './Chip';
import { Tooltip } from './Tooltip';

describe('Chip', () => {
  test('is a toggle button that reports its state and count', () => {
    render(
      <ChipGroup label="Event types">
        <Chip pressed onClick={() => {}} icon="commit" count={8}>
          Commits
        </Chip>
        <Chip pressed={false} onClick={() => {}} count={0}>
          Thread open/resolve
        </Chip>
      </ChipGroup>,
    );

    const group = screen.getByRole('group', { name: 'Event types' });
    expect(group).toContainElement(screen.getByRole('button', { name: 'Commits 8', pressed: true }));
    expect(screen.getByRole('button', { name: 'Thread open/resolve 0', pressed: false })).toBeInTheDocument();
  });

  test('calls onClick when toggled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Chip pressed={false} onClick={onClick}>
        All
      </Chip>,
    );

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('forwards its ref to the button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Chip ref={ref} pressed={false} onClick={() => {}}>
        All
      </Chip>,
    );

    expect(ref.current).toBe(screen.getByRole('button', { name: 'All' }));
  });

  test("in a Tooltip, it's the tooltip's target and described by it (its attributes reach the button)", () => {
    render(
      <Tooltip content="Data: prNumber, title">
        <Chip pressed={false} onClick={() => {}}>
          Numbers
        </Chip>
      </Tooltip>,
    );

    const chip = screen.getByRole('button', { name: 'Numbers' });
    expect(chip).toHaveAttribute('data-tip', 'Data: prNumber, title');
    expect(chip).toHaveAccessibleDescription('Data: prNumber, title');
  });
});
