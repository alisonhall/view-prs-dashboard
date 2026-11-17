/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsPopover } from './KeyboardShortcutsPopover';
import { KEYBOARD_SHORTCUTS } from '../../helpers/keyboard-shortcuts.helpers';

const renderWithElsewhere = () =>
  render(
    <>
      <button type="button">Elsewhere</button>
      <input aria-label="A field" />
      <KeyboardShortcutsPopover />
    </>,
  );

describe('KeyboardShortcutsPopover', () => {
  test('Shortcuts lists the keys by where they work; Esc closes it, back to the button', async () => {
    const user = userEvent.setup();
    renderWithElsewhere();
    const button = screen.getByRole('button', { name: 'Shortcuts' });
    expect(button).toHaveAttribute('aria-keyshortcuts', '?');

    await user.click(button);

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getAllByRole('region').map((group) => group.getAttribute('aria-label'))).toEqual(
      KEYBOARD_SHORTCUTS.map((group) => group.where),
    );
    const table = within(dialog).getByRole('region', { name: 'The PR table, with focus in it' });
    expect(within(table).getAllByRole('term').map((term) => term.textContent)).toEqual(['↑ / ↓ or j / k', 'a', 'Esc']);
    expect(table).toHaveTextContent('Ack the selected PR, or undo its Ack, with focus in its row.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  test('? opens it from anywhere; Esc puts the focus back where you were, and ? again closes it', async () => {
    const user = userEvent.setup();
    renderWithElsewhere();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();

    await user.keyboard('?');
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('? does nothing with a modal open (Settings), which would cover the list', async () => {
    const user = userEvent.setup();
    render(
      <>
        <div role="dialog" aria-modal="true" aria-label="Settings">
          <button type="button">In Settings</button>
        </div>
        <KeyboardShortcutsPopover />
      </>,
    );
    screen.getByRole('button', { name: 'In Settings' }).focus();

    await user.keyboard('?');

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In Settings' })).toHaveFocus();
  });

  test('a closed modal, kept mounted but hidden (Settings), does not stop ?', async () => {
    const user = userEvent.setup();
    render(
      <>
        <div hidden>
          <div role="dialog" aria-modal="true" aria-label="Settings" />
        </div>
        <KeyboardShortcutsPopover />
      </>,
    );

    await user.keyboard('?');

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  test('? typed in a field is a question mark', async () => {
    const user = userEvent.setup();
    renderWithElsewhere();

    await user.type(screen.getByRole('textbox', { name: 'A field' }), 'why?');

    expect(screen.getByRole('textbox', { name: 'A field' })).toHaveValue('why?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
