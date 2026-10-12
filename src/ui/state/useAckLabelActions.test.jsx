/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useAckLabelActions } = require('./useAckLabelActions.jsx');

function Probe({ onReady }) {
  const ackLabelActions = useAckLabelActions();
  onReady(ackLabelActions);
  return null;
}

const ACK_LABEL_WINDOW_BRIDGES = [
  'getFormBody',
  'setStatusMessage',
  'updateReactOutputText',
  'beginRequestActivity',
  'showErrorNotification',
  'showWarningNotification',
  'summarizeAckRefreshWarnings',
  'applyFreshPrPayload',
  'loadStoredData',
  'markPrsBusy',
  'clearPrsBusy',
  'markPrsQueued',
  'clearPrsQueued',
  'beginBulkActionBatch',
  'markBulkActionChunkInFlight',
  'markBulkActionChunkDone',
  'finishBulkActionBatch',
  'getLatestStoredPayload',
];

describe('useAckLabelActions', () => {
  afterEach(() => {
    ACK_LABEL_WINDOW_BRIDGES.forEach((name) => delete window[name]);
    delete global.fetch;
  });

  test('given a single PR number from the form, when calling handleAckOnly, then it posts to /view-prs/ack and applies the fresh payload directly', async () => {
    const statusMessages = [];
    const applyFreshPrPayload = jest.fn();
    window.getFormBody = () => ({ prNumbers: '42', repo: 'org/repo' });
    window.setStatusMessage = (message) => statusMessages.push(message);
    window.updateReactOutputText = jest.fn();
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, prData: { byPrNumber: { 42: {} } } }),
    });

    let ackLabelActions;
    render(<Probe onReady={(value) => { ackLabelActions = value; }} />);
    await act(async () => {
      await ackLabelActions.handleAckOnly();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/ack',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', ack: '42' }),
      }),
    );
    expect(statusMessages).toContain('Ack only completed');
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 42: {} } }, 'org/repo');
  });

  test('given no PR numbers anywhere, when calling handleClearOnly, then it bails early with a validation message and never fetches', async () => {
    const statusMessages = [];
    window.getFormBody = () => ({ prNumbers: '', repo: '' });
    window.setStatusMessage = (message) => statusMessages.push(message);
    global.fetch = jest.fn();

    let ackLabelActions;
    render(<Probe onReady={(value) => { ackLabelActions = value; }} />);
    await act(async () => {
      await ackLabelActions.handleClearOnly();
    });

    expect(statusMessages).toEqual(['Clear only requires numeric value(s) in "PR number(s)"']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given a real #apply-label-select element, when calling handleApplyLabelClick, then it reads the select value and posts to /view-prs/labels/apply', async () => {
    const select = document.createElement('select');
    select.id = 'apply-label-select';
    const option = document.createElement('option');
    option.value = 'bug';
    option.selected = true;
    select.appendChild(option);
    document.body.appendChild(select);

    window.getFormBody = () => ({ prNumbers: '42', repo: 'org/repo' });
    window.setStatusMessage = jest.fn();
    window.updateReactOutputText = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, prData: null }),
    });
    window.loadStoredData = jest.fn().mockResolvedValue(undefined);
    window.getLatestStoredPayload = jest.fn().mockReturnValue({ byPrNumber: {} });

    let ackLabelActions;
    render(<Probe onReady={(value) => { ackLabelActions = value; }} />);
    await act(async () => {
      await ackLabelActions.handleApplyLabelClick();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/labels/apply',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', label: 'bug', prNumbers: '42' }),
      }),
    );

    document.body.removeChild(select);
  });
});
