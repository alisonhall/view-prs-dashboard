/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useTriggerAutoRun } = require('./useTriggerAutoRun.tsx');
const { SnackbarContext } = require('./SnackbarContext');

function Probe({ onReady }) {
  const triggerAutoRun = useTriggerAutoRun();
  onReady(triggerAutoRun);
  return null;
}

const renderProbe = (onReady, showError) =>
  render(
    <SnackbarContext.Provider value={{ showError }}>
      <Probe onReady={onReady} />
    </SnackbarContext.Provider>,
  );

describe('useTriggerAutoRun', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('given a successful request, when triggered, then it posts to /view-prs/run-auto and shows no notification', async () => {
    const snackbarCalls = [];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    let triggerAutoRun;
    renderProbe((fn) => { triggerAutoRun = fn; }, (...args) => snackbarCalls.push(args));

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
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false }),
    });

    let triggerAutoRun;
    renderProbe((fn) => { triggerAutoRun = fn; }, (...args) => snackbarCalls.push(args));

    await act(async () => {
      await triggerAutoRun();
    });

    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Auto run already in progress');
  });

  test('given the request throws, when triggered, then it shows a failure snackbar, without throwing', async () => {
    const snackbarCalls = [];
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let triggerAutoRun;
    renderProbe((fn) => { triggerAutoRun = fn; }, (...args) => snackbarCalls.push(args));

    await act(async () => {
      await triggerAutoRun();
    });

    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Failed to trigger auto run');
  });
});
