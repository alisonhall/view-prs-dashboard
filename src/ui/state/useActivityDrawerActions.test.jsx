/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useActivityDrawerActions } = require('./useActivityDrawerActions.jsx');

function Probe({ onReady }) {
  const actions = useActivityDrawerActions();
  onReady(actions);
  return null;
}

describe('useActivityDrawerActions', () => {
  afterEach(() => {
    delete window.showErrorNotification;
    delete global.fetch;
  });

  test('given a successful bump request, when handleDispatcherBump is called, then it posts to /view-prs/dispatcher/bump and resolves true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleDispatcherBump('owner/repo', 'backfill');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/dispatcher/bump',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'owner/repo', taskType: 'backfill' }),
      }),
    );
    expect(result).toBe(true);
  });

  test('given a failed bump request, when handleDispatcherBump is called, then it shows a failure snackbar and resolves false', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleDispatcherBump('owner/repo', 'backfill');
    });

    expect(result).toBe(false);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Reprioritize failed');
  });

  test('given the bump request throws, when handleDispatcherBump is called, then it shows a failure snackbar and resolves false, without throwing', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleDispatcherBump('owner/repo', 'backfill');
    });

    expect(result).toBe(false);
    expect(snackbarCalls).toHaveLength(1);
  });

  test('given a successful reset request, when handleResetCircuitBreaker is called, then it posts to /view-prs/circuit-breaker/reset and resolves true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleResetCircuitBreaker();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/circuit-breaker/reset',
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
    expect(result).toBe(true);
  });

  test('given a failed reset request, when handleResetCircuitBreaker is called, then it shows a failure snackbar and resolves false', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleResetCircuitBreaker();
    });

    expect(result).toBe(false);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Reset failed');
  });
});
