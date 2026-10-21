/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { OutputTextProvider } = require('./OutputTextProvider');
const React = require('react');
const { useOutputText, useSetOutputText } = require('../state/OutputTextContext');

function Probe({ onValue }) {
  onValue(useOutputText());
  return null;
}

describe('OutputTextProvider', () => {
  afterEach(() => {
    delete window.updateReactOutputText;
  });

  test('given the provider mounts, when read, then it starts with the Run tab placeholder text', () => {
    let latest;
    render(
      <OutputTextProvider>
        <Probe onValue={(value) => (latest = value)} />
      </OutputTextProvider>,
    );

    expect(latest.outputText).toBe('Run the script to see output');
  });

  test('given a descendant calls setOutputText, when read, then the new text is reflected and the setter keeps one identity across renders', () => {
    let latest;
    const seenSetters = new Set();
    render(
      <OutputTextProvider>
        <Probe
          onValue={(value) => {
            latest = value;
            seenSetters.add(value.setOutputText);
          }}
        />
      </OutputTextProvider>,
    );

    act(() => latest.setOutputText('hello'));
    act(() => latest.setOutputText('world'));

    expect(latest.outputText).toBe('world');
    expect(seenSetters.size).toBe(1);
  });

  test('given index.page.js (vanilla) writes through window.updateReactOutputText, when called, then Context readers see it and the call reports success', () => {
    let latest;
    render(
      <OutputTextProvider>
        <Probe onValue={(value) => (latest = value)} />
      </OutputTextProvider>,
    );

    let returned;
    act(() => {
      returned = window.updateReactOutputText('from vanilla');
    });

    expect(returned).toBe(true);
    expect(latest.outputText).toBe('from vanilla');
  });

  test('given the provider unmounts, when unmounted, then the bridge is removed', () => {
    const { unmount } = render(<OutputTextProvider>{null}</OutputTextProvider>);

    expect(typeof window.updateReactOutputText).toBe('function');
    unmount();
    expect(window.updateReactOutputText).toBeUndefined();
  });

  test('given no provider at all, when a hook reads the Context, then the default is a safe no-op', () => {
    let latest;
    render(<Probe onValue={(value) => (latest = value)} />);

    expect(() => latest.setOutputText('ignored')).not.toThrow();
    expect(latest.outputText).toBe('');
  });

  // Regression: writers must not subscribe to the text. useSinglePrUpdate runs
  // inside PrTableApp, so when it read the whole { outputText, setOutputText }
  // value, every output write (each Run/Ack/Backfill action) re-rendered the
  // entire table.
  test('given a component that only uses the setter, when output is written repeatedly, then it never re-renders', () => {
    let renders = 0;
    let setter;
    const Writer = React.memo(function Writer() {
      setter = useSetOutputText();
      renders += 1;
      return null;
    });
    let latest;
    render(
      <OutputTextProvider>
        <Writer />
        <Probe onValue={(value) => (latest = value)} />
      </OutputTextProvider>,
    );
    const baseline = renders;

    for (let i = 0; i < 5; i += 1) {
      act(() => setter(`line ${i}`));
    }
    act(() => {
      window.updateReactOutputText('from vanilla');
    });

    expect(latest.outputText).toBe('from vanilla');
    expect(renders).toBe(baseline);
  });

  test('given the setter hook, when the text changes, then it keeps one identity and writes through to the text readers', () => {
    const seen = new Set();
    let latest;
    function Capture() {
      seen.add(useSetOutputText());
      return null;
    }
    render(
      <OutputTextProvider>
        <Capture />
        <Probe onValue={(value) => (latest = value)} />
      </OutputTextProvider>,
    );

    act(() => [...seen][0]('written via setter hook'));
    act(() => latest.setOutputText('again'));

    expect(latest.outputText).toBe('again');
    expect(seen.size).toBe(1);
  });

  test('given no provider at all, when the setter hook is used, then it is a safe no-op', () => {
    let setter;
    function Capture() {
      setter = useSetOutputText();
      return null;
    }
    render(<Capture />);

    expect(() => setter('ignored')).not.toThrow();
  });
});
