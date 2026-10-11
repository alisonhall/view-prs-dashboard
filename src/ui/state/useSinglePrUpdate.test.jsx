/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useSinglePrUpdate } = require('./useSinglePrUpdate.jsx');

function Probe({ onReady }) {
  const runSinglePrUpdate = useSinglePrUpdate();
  onReady(runSinglePrUpdate);
  return null;
}

describe('useSinglePrUpdate', () => {
  afterEach(() => {
    delete window.updateReactStatusText;
    delete window.updateReactOutputText;
    delete window.beginRequestActivity;
    delete window.showErrorNotification;
    delete window.applyFreshPrPayload;
    delete global.fetch;
  });

  test('given a successful update with a fresh payload, when running the update, then status/output messages are set in order and the fresh payload is applied directly, with no redundant reload', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const applyFreshPrPayload = jest.fn();
    const finishActivity = jest.fn();
    const beginRequestActivity = jest.fn(() => finishActivity);
    window.updateReactStatusText = (message) => statusMessages.push(message);
    window.updateReactOutputText = (message) => outputMessages.push(message);
    window.beginRequestActivity = beginRequestActivity;
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        output: 'ansi-output',
        prData: { byPrNumber: { 7: {} } },
      }),
    });

    let runSinglePrUpdate;
    render(<Probe onReady={(fn) => { runSinglePrUpdate = fn; }} />);

    await act(async () => {
      await runSinglePrUpdate({ repo: 'org/repo', prNumber: 7 }, { number: 7 });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/run',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', prNumber: '7', openMode: 'none', quiet: true }),
      }),
    );
    expect(statusMessages).toEqual(['Updating PR #7...', 'PR #7 updated']);
    expect(outputMessages).toEqual(['', 'ansi-output']);
    expect(beginRequestActivity).toHaveBeenCalledWith('singlePr');
    // Regression coverage for the old double-fetch/double-render this hook
    // replaces: exactly one direct payload application, no second fetch.
    expect(applyFreshPrPayload).toHaveBeenCalledTimes(1);
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 7: {} } }, 'org/repo');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given a failed update with a GitHub auth hint, when running the update, then auth-aware failure messaging and a snackbar notification are shown', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const snackbarCalls = [];
    window.updateReactStatusText = (message) => statusMessages.push(message);
    window.updateReactOutputText = (message) => outputMessages.push(message);
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        error: 'GitHub CLI authentication required: run gh auth login or sign in',
      }),
    });

    let runSinglePrUpdate;
    render(<Probe onReady={(fn) => { runSinglePrUpdate = fn; }} />);

    await act(async () => {
      await runSinglePrUpdate({}, { number: 11 });
    });

    expect(statusMessages).toEqual([
      'Updating PR #11...',
      'Failed to update PR #11',
      'Failed to update PR #11 (GitHub auth required)',
    ]);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Update failed for PR #11');
  });

  test('given a thrown error during the update, when running the update, then failure messaging and a snackbar notification are shown, and activity still finishes', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    window.updateReactStatusText = (message) => statusMessages.push(message);
    window.updateReactOutputText = (message) => outputMessages.push(message);
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    window.beginRequestActivity = () => finishActivity;
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let runSinglePrUpdate;
    render(<Probe onReady={(fn) => { runSinglePrUpdate = fn; }} />);

    await act(async () => {
      await runSinglePrUpdate({}, { number: 19 });
    });

    expect(statusMessages).toEqual(['Updating PR #19...', 'Failed to update PR #19']);
    expect(outputMessages).toEqual(['', 'Error: network down']);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Update failed for PR #19');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
