/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { TabStateProvider } = require('./TabStateProvider');
const { useTabState } = require('../state/TabStateContext');

function Probe({ onValue }) {
  const value = useTabState();
  onValue(value);
  return null;
}

describe('TabStateProvider', () => {
  afterEach(() => {
    delete window.activateDataTab;
    delete window.setActiveDataTab;
  });

  test('given no window.activateDataTab bridge is installed, when setActiveDataTab is called, then nothing throws', () => {
    let latest;
    render(
      <TabStateProvider>
        <Probe onValue={(value) => (latest = value)} />
      </TabStateProvider>,
    );

    expect(() => act(() => latest.setActiveDataTab('review-stats'))).not.toThrow();
    expect(latest.activeDataTab).toBe('review-stats');
  });

  test('given the provider is mounted, when read, then it publishes window.setActiveDataTab', () => {
    render(
      <TabStateProvider>
        <Probe onValue={() => {}} />
      </TabStateProvider>,
    );

    expect(typeof window.setActiveDataTab).toBe('function');
  });

  test('given window.setActiveDataTab is called (a vanilla-only caller triggering a switch), when called, then Context state updates too', () => {
    let latest;
    render(
      <TabStateProvider>
        <Probe onValue={(value) => (latest = value)} />
      </TabStateProvider>,
    );

    act(() => window.setActiveDataTab('author-insights'));

    expect(latest.activeDataTab).toBe('author-insights');
  });

  test('given setActiveDataTab is called, when switching, then the real window.activateDataTab bridge is called with the same key', () => {
    const activateDataTab = jest.fn();
    window.activateDataTab = activateDataTab;
    let latest;
    render(
      <TabStateProvider>
        <Probe onValue={(value) => (latest = value)} />
      </TabStateProvider>,
    );

    act(() => latest.setActiveDataTab('review-stats'));

    expect(activateDataTab).toHaveBeenCalledWith('review-stats');
  });

  test('given the provider unmounts, when unmounted, then the window.setActiveDataTab bridge is removed', () => {
    const { unmount } = render(
      <TabStateProvider>
        <Probe onValue={() => {}} />
      </TabStateProvider>,
    );

    expect(typeof window.setActiveDataTab).toBe('function');
    unmount();
    expect(window.setActiveDataTab).toBeUndefined();
  });
});
