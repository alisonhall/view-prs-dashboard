/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrDataProvider } = require('./PrDataProvider');
const { useRowCheckboxActions } = require('./useRowCheckboxActions.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');

function Probe({ onReady }) {
  const actions = useRowCheckboxActions();
  onReady(actions);
  return null;
}

describe('useRowCheckboxActions', () => {
  afterEach(() => {
    delete window.applyLatestPrData;
    delete window.loadStoredData;
    delete window.beginRequestActivity;
    delete global.fetch;
  });

  test('given toggleInReviewForRow succeeds with a full prData response, when called, then it posts the real request and syncs the vanilla mirror', async () => {
    const statusMessages = [];
    const applyLatestPrData = jest.fn();
    window.applyLatestPrData = applyLatestPrData;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, prData: { byPrNumber: { 7: {} } } }),
    });

    let actions;
    render(
      <StatusTextContext.Provider
        value={{ statusText: 'Not run', setStatusText: (message) => statusMessages.push(message) }}
      >
        <PrDataProvider initialSelectedRepo="owner/repo">
          <Probe onReady={(a) => { actions = a; }} />
        </PrDataProvider>
      </StatusTextContext.Provider>,
    );

    let result;
    await act(async () => {
      result = await actions.toggleInReviewForRow({ prNumber: '7', repo: 'owner/repo' }, { number: '7' }, true, {});
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/ack',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'owner/repo', inReview: '7' }),
      }),
    );
    expect(statusMessages).toEqual(['Enabling in-review for #7...', 'Enabled in-review for #7']);
    expect(applyLatestPrData).toHaveBeenCalledWith({
      payload: { byPrNumber: { 7: {} } },
      selectedRepo: 'owner/repo',
    });
    expect(result).toEqual({ payload: { byPrNumber: { 7: {} } }, selectedRepo: 'owner/repo' });
  });

  test('given toggleFlaggedForRow with nextValue=false, when called, then it posts a flaggedClear request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, prData: {} }),
    });

    let actions;
    render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <Probe onReady={(a) => { actions = a; }} />
      </PrDataProvider>,
    );

    await act(async () => {
      await actions.toggleFlaggedForRow({ prNumber: '9', repo: 'owner/repo' }, { number: '9' }, false, {});
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/ack',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'owner/repo', flaggedClear: '9' }),
      }),
    );
  });

  test('given the request fails, when called, then it shows a failure snackbar and returns null, without throwing', async () => {
    const snackbarCalls = [];
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let actions;
    render(
      <SnackbarContext.Provider value={{ showError: (...args) => snackbarCalls.push(args) }}>
        <PrDataProvider initialSelectedRepo="owner/repo">
          <Probe onReady={(a) => { actions = a; }} />
        </PrDataProvider>
      </SnackbarContext.Provider>,
    );

    let result;
    await act(async () => {
      result = await actions.toggleInReviewForRow({ prNumber: '3', repo: 'owner/repo' }, { number: '3' }, true, {});
    });

    expect(result).toBeNull();
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('In-review update failed for #3');
  });
});
