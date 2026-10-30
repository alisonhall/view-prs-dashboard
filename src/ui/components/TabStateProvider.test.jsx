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
  test('given setActiveDataTab is called, when switching, then Context state updates', () => {
    let latest;
    render(
      <TabStateProvider>
        <Probe onValue={(value) => (latest = value)} />
      </TabStateProvider>,
    );

    expect(() => act(() => latest.setActiveDataTab('review-stats'))).not.toThrow();
    expect(latest.activeDataTab).toBe('review-stats');
  });
});
