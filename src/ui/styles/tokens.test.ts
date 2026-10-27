import fs from 'fs';
import path from 'path';

// ESLint's CSS check allows unknown variables in src/ui/styles/ (it can't
// see tokens.css from another file), so this catches a mistyped or
// missing token instead: every var(--name) used here must be defined.
const STYLES_DIR = __dirname;
const readStyles = () =>
  fs
    .readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, text: fs.readFileSync(path.join(STYLES_DIR, name), 'utf8') }));

const definedIn = (text: string) => new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
const usedIn = (text: string) => [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);

describe('design tokens', () => {
  test('every variable a stylesheet in src/ui/styles uses is defined', () => {
    const files = readStyles();
    const defined = new Set(files.flatMap(({ text }) => [...definedIn(text)]));

    const missing = files.flatMap(({ name, text }) =>
      usedIn(text)
        .filter((variable) => !defined.has(variable))
        .map((variable) => `${name}: ${variable}`),
    );
    expect(missing).toEqual([]);
  });

  test('the check finds the tokens it is meant to check', () => {
    const tokens = readStyles().find(({ name }) => name === 'tokens.css');

    expect(tokens).toBeDefined();
    expect(definedIn(tokens?.text ?? '').has('--color-text')).toBe(true);
    expect(usedIn('a { color: var(--color-txt); }')).toEqual(['--color-txt']);
  });
});
