/** @jest-environment jsdom */

const React = require('react');
const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useNavigateToAuthorInsights } = require('./useNavigateToAuthorInsights.jsx');
const { TabStateProvider } = require('../components/TabStateProvider');
const { useTabState } = require('./TabStateContext');
const { PrDataProvider } = require('./PrDataProvider');
const { usePrData } = require('./PrDataContext');
const { AuthorInsightsContext, defaultAuthorInsights } = require('./AuthorInsightsContext');

let latestTabState;
let latestPrData;
function Probe({ onReady }) {
  latestTabState = useTabState();
  latestPrData = usePrData();
  const navigateToAuthorInsights = useNavigateToAuthorInsights();
  onReady(navigateToAuthorInsights);
  return null;
}

const renderHarness = (onReady, { initialPayload, buildAuthorInsightsEntries } = {}) =>
  render(
    React.createElement(
      PrDataProvider,
      { initialPayload },
      React.createElement(
        TabStateProvider,
        null,
        React.createElement(
          AuthorInsightsContext.Provider,
          { value: { ...defaultAuthorInsights, buildAuthorInsightsEntries: buildAuthorInsightsEntries || (() => []) } },
          React.createElement(Probe, { onReady }),
        ),
      ),
    ),
  );

describe('useNavigateToAuthorInsights', () => {
  afterEach(() => {
    latestTabState = undefined;
    latestPrData = undefined;
    delete window.activateDataTab;
  });

  test('given a valid author login, when calling the hook function, then it switches to the author-insights tab and writes the login', () => {
    let navigateToAuthorInsights;
    renderHarness((fn) => { navigateToAuthorInsights = fn; }, {
      initialPayload: { byPrNumber: { 1: {} }, actorsMap: {} },
      buildAuthorInsightsEntries: () => [{ login: 'alice' }],
    });

    let result;
    act(() => {
      result = navigateToAuthorInsights('alice');
    });

    expect(result).toBe(true);
    expect(latestTabState.activeDataTab).toBe('author-insights');
    expect(latestPrData.selectedAuthorLogin).toBe('alice');
  });

  test('given a requested login no longer present in the current options, when calling the hook function, then it writes the first valid option instead', () => {
    let navigateToAuthorInsights;
    renderHarness((fn) => { navigateToAuthorInsights = fn; }, {
      initialPayload: { byPrNumber: { 1: {} }, actorsMap: {} },
      buildAuthorInsightsEntries: () => [{ login: 'bob' }],
    });

    act(() => {
      navigateToAuthorInsights('stale-login');
    });

    expect(latestPrData.selectedAuthorLogin).toBe('bob');
  });

  test('given an empty author login, when calling the hook function, then it returns false and does not switch tabs', () => {
    let navigateToAuthorInsights;
    renderHarness((fn) => { navigateToAuthorInsights = fn; });

    let result;
    act(() => {
      result = navigateToAuthorInsights('');
    });

    expect(result).toBe(false);
    expect(latestTabState.activeDataTab).toBe('pr-data');
  });

  test('given focusUnsaved and a real #author-insights-select element, when calling the hook function, then it eventually focuses it', async () => {
    const select = document.createElement('select');
    select.id = 'author-insights-select';
    document.body.appendChild(select);

    let navigateToAuthorInsights;
    renderHarness((fn) => { navigateToAuthorInsights = fn; }, {
      initialPayload: { byPrNumber: { 1: {} }, actorsMap: {} },
      buildAuthorInsightsEntries: () => [{ login: 'alice' }],
    });

    jest.useFakeTimers();
    act(() => {
      navigateToAuthorInsights('alice', { focusUnsaved: true });
    });
    act(() => {
      jest.advanceTimersByTime(30);
    });
    jest.useRealTimers();

    expect(document.activeElement).toBe(select);

    document.body.removeChild(select);
  });
});
