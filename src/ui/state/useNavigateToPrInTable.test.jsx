/** @jest-environment jsdom */

const React = require('react');
const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useNavigateToPrInTable } = require('./useNavigateToPrInTable.jsx');
const { TabStateProvider } = require('../components/TabStateProvider');
const { useTabState } = require('./TabStateContext');

let latestTabState;
function Probe({ onReady }) {
  latestTabState = useTabState();
  const navigateToPrInTable = useNavigateToPrInTable();
  onReady(navigateToPrInTable);
  return null;
}

describe('useNavigateToPrInTable', () => {
  afterEach(() => {
    latestTabState = undefined;
    delete window.activateDataTab;
  });

  test('given a PR number, when calling the hook function, then it switches to the pr-data tab and dispatches pr-navigate-to-insights', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);

    let navigateToPrInTable;
    render(
      React.createElement(TabStateProvider, null, React.createElement(Probe, { onReady: (fn) => { navigateToPrInTable = fn; } })),
    );

    let result;
    act(() => {
      result = navigateToPrInTable('42', { focusUnsaved: true });
    });

    expect(result).toBe(true);
    expect(latestTabState.activeDataTab).toBe('pr-data');
    expect(events).toEqual([{ prNumber: '42', focusUnsaved: true }]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });

  test('given no focusUnsaved option, when calling the hook function, then the dispatched event defaults it to false', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);

    let navigateToPrInTable;
    render(
      React.createElement(TabStateProvider, null, React.createElement(Probe, { onReady: (fn) => { navigateToPrInTable = fn; } })),
    );

    act(() => {
      navigateToPrInTable('7');
    });

    expect(events).toEqual([{ prNumber: '7', focusUnsaved: false }]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });

  test('given an empty PR number, when calling the hook function, then it returns false and does not switch tabs or dispatch', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);

    let navigateToPrInTable;
    render(
      React.createElement(TabStateProvider, null, React.createElement(Probe, { onReady: (fn) => { navigateToPrInTable = fn; } })),
    );

    let result;
    act(() => {
      result = navigateToPrInTable('');
    });

    expect(result).toBe(false);
    expect(events).toEqual([]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });
});
