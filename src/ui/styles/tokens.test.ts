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
    const SERIES = Array.from({ length: 16 }, (_, index) => `--color-series-${index}`);
    const belowThreeToOne = (theme: Record<string, string>, names: string[], backgrounds: string[]) =>
      names.flatMap((name) =>
        backgrounds
          .map((background) => ({ pair: `${name} on ${background}`, ratio: contrast(theme[name], theme[background]) }))
          .filter(({ ratio }) => !(ratio >= 3))
          .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`),
      );

    // The line chart's background fades from the surface to the inset colour.
    test.each([
      ['light', light],
      ['dark', dark],
    ])('in the %s theme, every chart line stands out from the chart background', (_name, theme) => {
      expect(belowThreeToOne(theme, SERIES, ['--color-surface', '--color-surface-inset'])).toEqual([]);
    });

    // CIE76 colour difference (ΔE) of two #rrggbb colours, in CIELAB (D65).
    const toLab = (hex = '') => {
      const [r = 0, g = 0, b = 0] = [1, 3, 5]
        .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
      const fx = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
      const fy = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
      const fz = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    };
    const deltaE = (a?: string, b?: string) => {
      const [l1 = 0, a1 = 0, b1 = 0] = toLab(a);
      const [l2 = 0, a2 = 0, b2 = 0] = toLab(b);
      return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
    };

    // Below about 20, two thin lines (and their legend dots) are easy to mix up.
    test.each([
      ['light', light],
      ['dark', dark],
    ])('in the %s theme, every two chart lines are clearly different colours', (_name, theme) => {
      const tooClose = SERIES.flatMap((first, index) =>
        SERIES.slice(index + 1)
          .map((second) => ({ pair: `${first} and ${second}`, difference: deltaE(theme[first], theme[second]) }))
          .filter(({ difference }) => !(difference >= 20))
          .map(({ pair, difference }) => `${pair}: ${difference.toFixed(1)}`),
      );
      expect(tooClose).toEqual([]);
    });

    test('the colour difference matches known values', () => {
      expect(deltaE('#ffffff', '#ffffff')).toBe(0);
      expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 0);
    });

    test("in the dark theme, the darkest avatar's circle stands out from the surface", () => {
      expect(belowThreeToOne(dark, ['--color-avatar-dark'], ['--color-surface'])).toEqual([]);
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
