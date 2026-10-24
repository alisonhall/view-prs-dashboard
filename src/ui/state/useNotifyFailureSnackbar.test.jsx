/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
const { useNotifyFailureSnackbar } = require('./useNotifyFailureSnackbar.ts');
const { SnackbarContext } = require('./SnackbarContext');

function Probe({ onReady }) {
  onReady(useNotifyFailureSnackbar());
  return null;
}

const renderProbe = (showError) => {
  let notify;
  render(
    <SnackbarContext.Provider value={{ showError }}>
      <Probe onReady={(fn) => { notify = fn; }} />
    </SnackbarContext.Provider>,
  );
  return notify;
};

describe('useNotifyFailureSnackbar', () => {
  test('given an error with a message, when notified, then it shows that message as a snackbar that stays', () => {
    const showError = jest.fn();
    const notify = renderProbe(showError);

    notify('Save failed', new Error('Server unavailable'), 'Unable to save');

    expect(showError).toHaveBeenCalledWith('Save failed', 'Server unavailable', 0);
  });

  test('given a timeout error, when notified, then "(timed out)" is added to the title', () => {
    const showError = jest.fn();
    const notify = renderProbe(showError);

    notify('Save failed', { error: 'Request timed out' }, 'Unable to save');

    expect(showError).toHaveBeenCalledWith('Save failed (timed out)', 'Request timed out', 0);
  });

  test('given an error with no message, when notified, then the fallback message is shown', () => {
    const showError = jest.fn();
    const notify = renderProbe(showError);

    notify('Save failed', {}, 'Unable to save');

    expect(showError).toHaveBeenCalledWith('Save failed', 'Unable to save', 0);
  });
});
