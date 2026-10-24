/** @jest-environment jsdom */

const { render, act, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { SnackbarProvider } = require('./SnackbarProvider');
const { Snackbar } = require('./Snackbar');
const { useSnackbar } = require('../state/SnackbarContext');

// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): the
// Provider had no unit tests; e2e's Snackbar test drove it through
// window.showErrorNotification/showWarningNotification (deleted) and was the
// only coverage of the warning variant and the auto-dismiss timer. e2e now
// triggers real failures; the timer and defaults are covered here.
let snackbar;
function Capture() {
  snackbar = useSnackbar();
  return null;
}

const renderSnackbar = () =>
  render(
    <SnackbarProvider>
      <Capture />
      <Snackbar />
    </SnackbarProvider>,
  );

const element = () => document.getElementById('error-snackbar');
const messageText = () => document.getElementById('error-snackbar-message').textContent;

describe('SnackbarProvider + Snackbar', () => {
  afterEach(() => {
    jest.useRealTimers();
    snackbar = undefined;
  });

  test('given the provider mounts, when read, then the snackbar is hidden and no window bridges are published', () => {
    renderSnackbar();

    expect(element()).not.toBeVisible();
    expect(window.showErrorNotification).toBeUndefined();
    expect(window.showWarningNotification).toBeUndefined();
    expect(window.hideErrorNotification).toBeUndefined();
  });

  test('given showError with a detail, when shown, then it is visible as an error with title and detail on separate paragraphs', () => {
    renderSnackbar();

    act(() => snackbar.showError('Request failed', 'HTTP 500', 0));

    expect(element()).toBeVisible();
    expect(element()).not.toHaveClass('error-snackbar-warning');
    expect(messageText()).toBe('Request failed\n\nHTTP 500');
  });

  test('given showWarning without a detail, when shown, then it is visible with the warning class and only the title', () => {
    renderSnackbar();

    act(() => snackbar.showWarning('Auto-refresh warning', '', 0));

    expect(element()).toBeVisible();
    expect(element()).toHaveClass('error-snackbar-warning');
    expect(messageText()).toBe('Auto-refresh warning');
  });

  test('given a visible snackbar, when the close button is clicked, then it hides', () => {
    renderSnackbar();
    act(() => snackbar.showError('Request failed', '', 0));

    fireEvent.click(document.getElementById('error-snackbar-close'));

    expect(element()).not.toBeVisible();
  });

  test('given an auto-dismiss time, when it elapses, then the snackbar hides; with 0 it stays', () => {
    jest.useFakeTimers();
    renderSnackbar();

    act(() => snackbar.showError('Auto dismiss', '', 300));
    act(() => jest.advanceTimersByTime(299));
    expect(element()).toBeVisible();
    act(() => jest.advanceTimersByTime(1));
    expect(element()).not.toBeVisible();

    act(() => snackbar.showError('Sticky', '', 0));
    act(() => jest.advanceTimersByTime(60000));
    expect(element()).toBeVisible();
  });

  test('given no auto-dismiss argument, when shown, then errors dismiss after 8s and warnings after 12s', () => {
    jest.useFakeTimers();
    renderSnackbar();

    act(() => snackbar.showError('Default error'));
    act(() => jest.advanceTimersByTime(7999));
    expect(element()).toBeVisible();
    act(() => jest.advanceTimersByTime(1));
    expect(element()).not.toBeVisible();

    act(() => snackbar.showWarning('Default warning'));
    act(() => jest.advanceTimersByTime(11999));
    expect(element()).toBeVisible();
    act(() => jest.advanceTimersByTime(1));
    expect(element()).not.toBeVisible();
  });

  test('given a pending auto-dismiss, when a new notification is shown, then the old timer no longer hides the new one', () => {
    jest.useFakeTimers();
    renderSnackbar();

    act(() => snackbar.showError('First', '', 300));
    act(() => jest.advanceTimersByTime(200));
    act(() => snackbar.showWarning('Second', '', 0));
    act(() => jest.advanceTimersByTime(500));

    expect(element()).toBeVisible();
    expect(messageText()).toBe('Second');
  });

  test('given a pending auto-dismiss, when the provider unmounts, then the timer is cleared', () => {
    jest.useFakeTimers();
    const { unmount } = renderSnackbar();
    act(() => snackbar.showError('Bye', '', 300));

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
