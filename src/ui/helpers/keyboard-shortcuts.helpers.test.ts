import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatKeyboardShortcutLine, KEYBOARD_SHORTCUTS } from './keyboard-shortcuts.helpers';

const readme = readFileSync(join(__dirname, '..', '..', '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');

describe('keyboard-shortcuts.helpers', () => {
  test('a shortcut reads as the README lists it', () => {
    expect(formatKeyboardShortcutLine({ keys: ['↑ / ↓', 'j / k'], action: 'Select the PR above or below.' })).toBe(
      '`↑ / ↓` or `j / k`: Select the PR above or below.',
    );
  });

  test("the README's Keyboard shortcuts repeats the list line for line, in order", () => {
    const section = readme.slice(readme.indexOf('**Keyboard shortcuts.**'));
    expect(section.length).toBeLessThan(readme.length);
    const expected = KEYBOARD_SHORTCUTS.flatMap((group) => [
      `- ${group.where}:`,
      ...group.shortcuts.map((shortcut) => `  - ${formatKeyboardShortcutLine(shortcut)}`),
    ]).join('\n');
    expect(section).toContain(`\n\n${expected}\n\n`);
  });
});
