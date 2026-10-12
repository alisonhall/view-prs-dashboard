/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRunScript } = require('./useRunScript.jsx');

function Probe({ onReady }) {
  const runScript = useRunScript();
  onReady(runScript);
  return null;
}

describe('useRunScript', () => {
  afterEach(() => {
    delete window.getFormBody;
    delete window.setStatusMessage;
    delete window.updateReactOutputText;
    delete window.beginRequestActivity;
    delete window.applyFreshPrPayload;
    delete window.showErrorNotification;
    delete global.fetch;
  });

  test('given a single successful target, when running the script, then status/output messages track progress and the fresh payload is applied', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const applyFreshPrPayload = jest.fn();
    const finishActivity = jest.fn();
    window.getFormBody = () => ({
      repo: 'org/repo',
      prNumbersInput: '7',
      prNumberList: ['7'],
      prNumber: '7',
    });
    window.setStatusMessage = (message) => statusMessages.push(message);
    window.updateReactOutputText = (message) => outputMessages.push(message);
    window.beginRequestActivity = jest.fn(() => finishActivity);
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, output: 'done', prData: { byPrNumber: { 7: {} } } }),
    });

    let runScript;
    render(<Probe onReady={(fn) => { runScript = fn; }} />);
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual([
      'Running...',
      'Running PR #7 (1/1)...',
      'Completed',
    ]);
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 7: {} } }, 'org/repo');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given a non-numeric PR number input, when running the script, then it bails early with a validation message and never fetches', async () => {
    const statusMessages = [];
    window.getFormBody = () => ({
      repo: 'org/repo',
      prNumbersInput: 'not-a-number',
      prNumberList: [],
      prNumber: '',
    });
    window.setStatusMessage = (message) => statusMessages.push(message);
    global.fetch = jest.fn();

    let runScript;
    render(<Probe onReady={(fn) => { runScript = fn; }} />);
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual(['Run script requires numeric PR number(s) in "PR number(s)"']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given the fetch throws, when running the script, then failure messaging is shown and activity still finishes', async () => {
    const statusMessages = [];
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    window.getFormBody = () => ({ repo: 'org/repo', prNumbersInput: '', prNumberList: [], prNumber: '' });
    window.setStatusMessage = (message) => statusMessages.push(message);
    window.updateReactOutputText = jest.fn();
    window.beginRequestActivity = () => finishActivity;
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let runScript;
    render(<Probe onReady={(fn) => { runScript = fn; }} />);
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual([
      'Running...',
      'Running All PRs (1/1)...',
      'Failed (network/error)',
    ]);
    expect(snackbarCalls).toHaveLength(1);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
