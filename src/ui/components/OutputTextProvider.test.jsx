/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { OutputTextProvider } = require('./OutputTextProvider');
const { useOutputText } = require('../state/OutputTextContext');

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
});
