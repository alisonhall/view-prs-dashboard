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

  describe('the dark theme', () => {
    const tokens = fs.readFileSync(path.join(STYLES_DIR, 'tokens.css'), 'utf8');
    const block = (selector: string) => {
      const start = tokens.indexOf(`${selector} {`);
      if (start < 0) throw new Error(`no ${selector} block`);
      const body = tokens.slice(start, tokens.indexOf('\n}', start));
      return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], (match[2] ?? '').trim()]));
    };
    const light = block(':root');
    const dark = block(':root[data-theme="dark"]');
    const themed = (name: string) => name.startsWith('--color-') || name.startsWith('--shadow-');

    test('redefines every colour and shadow, and nothing else', () => {
      expect(Object.keys(dark).sort()).toEqual(Object.keys(light).filter(themed).sort());
    });

    // WCAG contrast of two #rrggbb colours.
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
      const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a = '', b = '') => {
      const [first, second] = [luminance(a), luminance(b)];
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    const TEXT_ON_SURFACES = [
      '--color-text',
      '--color-text-muted',
      '--color-accent-text',
      '--color-success',
      '--color-danger',
      '--color-attention-text',
      '--color-info',
    ];
    const PAIRS: Array<[string, string]> = [
      ...TEXT_ON_SURFACES.flatMap((text): Array<[string, string]> => [
        [text, '--color-surface'],
        [text, '--color-canvas'],
        [text, '--color-surface-inset'],
      ]),
      ['--color-text-on-strong', '--color-accent-strong'],
      ['--color-text-on-strong', '--color-danger-strong'],
      ['--color-text-on-strong', '--color-attention-strong'],
      ['--color-text', '--color-pending-strong'],
      ['--color-text-inverse', '--color-text'],
      ['--color-tooltip-text', '--color-tooltip-bg'],
      ['--color-accent-text', '--color-accent-subtle'],
      ['--color-success', '--color-success-subtle'],
      ['--color-danger', '--color-danger-subtle'],
      ['--color-attention-text', '--color-attention-subtle'],
      ...[0, 1, 2, 3, 4].map((hue): [string, string] => [`--color-label-${hue}-text`, `--color-label-${hue}-bg`]),
    ];

    test.each([
      ['light', light],
      ['dark', dark],
    ])('in the %s theme, text meets 4.5:1 on its backgrounds', (_name, theme) => {
      const failing = PAIRS.map(([text, background]) => ({ pair: `${text} on ${background}`, ratio: contrast(theme[text], theme[background]) }))
        .filter(({ ratio }) => !(ratio >= 4.5))
        .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });

    // Lines and shapes need 3:1 to be seen (WCAG's non-text contrast).
    test("in the dark theme, every chart line and the darkest avatar's circle stand out from the surface", () => {
      const shapes = [...Array.from({ length: 16 }, (_, index) => `--color-series-${index}`), '--color-avatar-dark'];
      const failing = shapes
        .map((name) => ({ name, ratio: contrast(dark[name], dark['--color-surface']) }))
        .filter(({ ratio }) => !(ratio >= 3))
        .map(({ name, ratio }) => `${name}: ${ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });

    test.each([
      ['light', light],
      ['dark', dark],
    ])("in the %s theme, the darkest avatar's white initials meet 4.5:1", (_name, theme) => {
      expect(contrast('#ffffff', theme['--color-avatar-dark'])).toBeGreaterThanOrEqual(4.5);
    });
  });

  test('the check finds the tokens it is meant to check', () => {
    const tokens = readStyles().find(({ name }) => name === 'tokens.css');

    expect(tokens).toBeDefined();
    expect(definedIn(tokens?.text ?? '').has('--color-text')).toBe(true);
    expect(usedIn('a { color: var(--color-txt); }')).toEqual(['--color-txt']);
  });
});
