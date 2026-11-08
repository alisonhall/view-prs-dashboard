// The app's keyboard shortcuts, by where they work: the Keyboard shortcuts
// popover (shell/KeyboardShortcutsPopover.tsx) lists them, and the
// README's "Keyboard shortcuts" repeats them line for line (its test
// checks). The keys themselves are handled where they work - PrTable,
// Tabs, the Settings drawer, useHeaderPopover, MultiSelectDropdown,
// ComboBox, MenuButton - so a change there belongs here too.

export interface KeyboardShortcut {
  // Each a key or keys that do the same, e.g. ["↑ / ↓", "j / k"].
  keys: string[];
  action: string;
}

export interface KeyboardShortcutGroup {
  where: string;
  shortcuts: KeyboardShortcut[];
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcutGroup[] = [
  {
    where: "Anywhere",
    shortcuts: [
      { keys: ["?"], action: "Show or hide this list (not while typing in a field, or with Settings or another dialog open)." },
      { keys: ["Esc"], action: "Close the open popover, drawer or dialog." },
    ],
  },
  {
    where: "Tabs, with focus on them (the views, the detail pane's, Settings' sections)",
    shortcuts: [
      { keys: ["← / →"], action: "Show the tab before or after (↑ / ↓ for Settings' sections down the left)." },
      { keys: ["Home / End"], action: "Show the first or last tab." },
    ],
  },
  {
    where: "The PR table, with focus in it",
    shortcuts: [
      { keys: ["↑ / ↓", "j / k"], action: "Select the PR above or below." },
      { keys: ["a"], action: "Ack the selected PR, or undo its Ack, with focus in its row." },
      { keys: ["Esc"], action: "Clear the selection." },
    ],
  },
  {
    where: "Search boxes (Search PRs, a long list's Search)",
    shortcuts: [{ keys: ["Esc"], action: "Clear what's typed; in a list with nothing typed, close the list." }],
  },
  {
    where: "Pickers and menus (Author, More actions)",
    shortcuts: [
      { keys: ["↑ / ↓"], action: "Move through the options." },
      { keys: ["Enter"], action: "Choose the option." },
      { keys: ["Esc"], action: "Close without choosing." },
    ],
  },
];

// One shortcut as the README lists it: "`↑ / ↓` or `j / k`: Select ...".
export const formatKeyboardShortcutLine = ({ keys, action }: KeyboardShortcut): string =>
  `${keys.map((key) => `\`${key}\``).join(" or ")}: ${action}`;
