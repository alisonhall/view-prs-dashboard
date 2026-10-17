/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useTriggerAutoRun } = require('./useTriggerAutoRun.jsx');

function Probe({ onReady }) {
  const triggerAutoRun = useTriggerAutoRun();
  onReady(triggerAutoRun);
  return null;
}

describe('useTriggerAutoRun', () => {
  afterEach(() => {
    delete window.showErrorNotification;
    delete global.fetch;
  });

  test('given a successful request, when triggered, then it posts to /view-prs/run-auto and shows no notification', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    let triggerAutoRun;
    render(<Probe onReady={(fn) => { triggerAutoRun = fn; }} />);

    await act(async () => {
      await triggerAutoRun();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/run-auto',
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
    expect(snackbarCalls).toHaveLength(0);
  });

  test('given a 409 (already in progress), when triggered, then it shows the matching notification', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false }),
    });

    let triggerAutoRun;
    render(<Probe onReady={(fn) => { triggerAutoRun = fn; }} />);

    await act(async () => {
      await triggerAutoRun();
    });

    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Auto run already in progress');
  });

  test('given the request throws, when triggered, then it shows a failure snackbar, without throwing', async () => {
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let triggerAutoRun;
    render(<Probe onReady={(fn) => { triggerAutoRun = fn; }} />);

    await act(async () => {
      await triggerAutoRun();
    });

    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Failed to trigger auto run');
  });
});
