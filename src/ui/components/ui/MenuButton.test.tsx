/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeMenuPosition, MenuButton, type MenuEntry } from './MenuButton';

const buildEntries = (onJson = jest.fn(), onLabel = jest.fn(), labels = ['bug', 'docs']): MenuEntry[] => [
  { id: 'json', label: 'View JSON', icon: 'braces', onSelect: onJson },
  {
    id: 'labels',
    label: 'Add label',
    emptyText: 'No labels to add',
    items: labels.map((name) => ({ id: name, label: name, onSelect: () => onLabel(name) })),
  },
];

const renderMenu = (entries = buildEntries()) =>
  render(
    <>
      <MenuButton icon="more" label="More actions for PR #2" entries={entries} />
      <button type="button">Elsewhere</button>
    </>,
  );

describe('MenuButton', () => {
  test('is a closed menu button until clicked', async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = screen.getByRole('button', { name: 'More actions for PR #2' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'More actions for PR #2' });
    expect(button).toHaveAttribute('aria-controls', menu.id);
    expect(menu.parentElement).toBe(document.body);
  });

  test('opens with the first item focused, and lists grouped items under a named group', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: 'More actions for PR #2' }));
    expect(screen.getByRole('menuitem', { name: 'View JSON' })).toHaveFocus();
    const group = screen.getByRole('group', { name: 'Add label' });
    expect(group).toContainElement(screen.getByRole('menuitem', { name: 'bug' }));
    expect(group).toContainElement(screen.getByRole('menuitem', { name: 'docs' }));
  });

  // Browsers don't focus a visibility: hidden element (jsdom does), and the
  // menu is hidden until it has been placed.
  test('focuses the first item only once the menu is placed and visible', async () => {
    const user = userEvent.setup();
    renderMenu();
    const visibilityAtFocus: string[] = [];
    const onFocusIn = (event: FocusEvent) => {
      const menu = (event.target as Element).closest('[role="menu"]') as HTMLElement | null;
      if (menu) visibilityAtFocus.push(menu.style.visibility);
    };
    document.addEventListener('focusin', onFocusIn);

    await user.click(screen.getByRole('button', { name: 'More actions for PR #2' }));
    document.removeEventListener('focusin', onFocusIn);

    expect(screen.getByRole('menuitem', { name: 'View JSON' })).toHaveFocus();
    expect(visibilityAtFocus).toEqual(['']);
  });

  test('arrow keys, Home and End move between items, wrapping at the ends', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for PR #2' }));

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'bug' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'docs' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'View JSON' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'docs' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'View JSON' })).toHaveFocus();
  });

  test('ArrowUp on the button opens with the last item focused', async () => {
    const user = userEvent.setup();
    renderMenu();
    screen.getByRole('button', { name: 'More actions for PR #2' }).focus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'docs' })).toHaveFocus();
  });

  test('choosing an item runs it, closes the menu and returns focus to the button', async () => {
    const user = userEvent.setup();
    const onLabel = jest.fn();
    renderMenu(buildEntries(jest.fn(), onLabel));
    const button = screen.getByRole('button', { name: 'More actions for PR #2' });

    await user.click(button);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onLabel).toHaveBeenCalledWith('bug');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  test('Escape closes and returns focus; a click outside closes without taking focus back', async () => {
    const user = userEvent.setup();
    renderMenu();
    const button = screen.getByRole('button', { name: 'More actions for PR #2' });

    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });

  test('its clicks and keys don\'t reach a clickable row around it (React bubbles portal events)', async () => {
    const user = userEvent.setup();
    const onRowClick = jest.fn();
    const onRowKeyDown = jest.fn();
    const onJson = jest.fn();
    render(
      // A stand-in for phase 4's clickable row.
      <div onClick={onRowClick} onKeyDown={onRowKeyDown}>
        <MenuButton icon="more" label="More actions for PR #2" entries={buildEntries(onJson)} />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for PR #2' }));
    await user.keyboard('{ArrowDown}{ArrowUp}');
    await user.click(screen.getByRole('menuitem', { name: 'View JSON' }));

    expect(onJson).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  test('a group with no items shows its empty text', async () => {
    const user = userEvent.setup();
    renderMenu(buildEntries(jest.fn(), jest.fn(), []));

    await user.click(screen.getByRole('button', { name: 'More actions for PR #2' }));
    expect(screen.getByRole('group', { name: 'Add label' })).toHaveTextContent('No labels to add');
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });
});

describe('computeMenuPosition', () => {
  const viewport = { width: 1000, height: 800 };
  const menu = { width: 200, height: 150 };

  test('opens below the button, right-aligned to it', () => {
    expect(computeMenuPosition({ top: 100, bottom: 128, right: 600 }, menu, viewport)).toEqual({ top: 132, left: 400 });
  });

  test('flips above when there is no room below', () => {
    expect(computeMenuPosition({ top: 700, bottom: 728, right: 600 }, menu, viewport)).toEqual({ top: 546, left: 400 });
  });

  test('stays inside the window at the left edge', () => {
    expect(computeMenuPosition({ top: 100, bottom: 128, right: 100 }, menu, viewport).left).toBe(8);
  });
});
