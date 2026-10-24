/** @jest-environment jsdom */

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, IconButton } from './Button';

describe('Button', () => {
  test('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Update</Button>);

    const button = screen.getByRole('button', { name: 'Update' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  test('is a toggle when given pressed', () => {
    render(
      <Button icon="eye" pressed>
        In review
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'In review', pressed: true })).toBeInTheDocument();
  });

  test('passes clicks and other attributes through', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button variant="primary" onClick={onClick} title="Save the notes">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('title', 'Save the notes');
  });

  test('forwards its ref to the button, so focus can be moved to it', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Next</Button>);

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Next' }));
    ref.current?.focus();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus();
  });
});

describe('IconButton', () => {
  test('is named by its label, which also shows as a tooltip without being read twice', async () => {
    const user = userEvent.setup();
    render(<IconButton icon="refresh" label="Update PR #418" />);

    const button = screen.getByRole('button', { name: 'Update PR #418' });
    expect(button).not.toHaveAccessibleDescription();

    await user.hover(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Update PR #418');
  });

  test('reports its pressed state and tone', () => {
    render(<IconButton icon="flag" label="Flagged" pressed tone="danger" />);

    const button = screen.getByRole('button', { name: 'Flagged', pressed: true });
    expect(button).toHaveAttribute('data-tone', 'danger');
  });

  test('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<IconButton icon="check" label="Ack PR #1" onClick={onClick} disabled />);

    await user.click(screen.getByRole('button', { name: 'Ack PR #1' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  test('forwards its ref to the button, not the tooltip wrapper', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} icon="chevronDown" label="Next PR" />);

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Next PR' }));
  });
});
