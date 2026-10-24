/** @jest-environment jsdom */

const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawerCircuitBreakerSection } = require('./ActivityDrawerCircuitBreakerSection');

const renderWithRepos = (openAutoCircuitRepos, props = {}) =>
  render(
    <JobEventsContext.Provider value={{ openAutoCircuitRepos }}>
      <ActivityDrawerCircuitBreakerSection {...props} />
    </JobEventsContext.Provider>,
  );

describe('ActivityDrawerCircuitBreakerSection', () => {
  test('renders nothing when no repo has an open circuit', () => {
    const { container } = renderWithRepos([]);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when openAutoCircuitRepos is missing from context entirely (defensive default)', () => {
    const { container } = render(
      <JobEventsContext.Provider value={{}}>
        <ActivityDrawerCircuitBreakerSection />
      </JobEventsContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('lists every repo with an open circuit', () => {
    renderWithRepos(['owner/repo-a', 'owner/repo-b']);

    expect(screen.getByText('Circuit breaker')).toBeInTheDocument();
    expect(screen.getByText('owner/repo-a')).toBeInTheDocument();
    expect(screen.getByText('owner/repo-b')).toBeInTheDocument();
  });

  test('does not render a reset button when onReset is not provided', () => {
    renderWithRepos(['owner/repo-a']);
    expect(screen.queryByRole('button', { name: 'Reset circuit breaker' })).not.toBeInTheDocument();
  });

  test('clicking "Reset circuit breaker" calls onReset with no arguments', async () => {
    const onReset = jest.fn().mockResolvedValue(true);
    renderWithRepos(['owner/repo-a'], { onReset });

    const button = screen.getByRole('button', { name: 'Reset circuit breaker' });
    fireEvent.click(button);

    expect(onReset).toHaveBeenCalledWith();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  test('disables the reset button while a request is in flight', async () => {
    let resolveReset;
    const onReset = jest.fn(() => new Promise((resolve) => { resolveReset = resolve; }));
    renderWithRepos(['owner/repo-a'], { onReset });

    const button = screen.getByRole('button', { name: 'Reset circuit breaker' });
    fireEvent.click(button);

    expect(screen.getByRole('button', { name: 'Resetting…' })).toBeDisabled();

    resolveReset(true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reset circuit breaker' })).not.toBeDisabled(),
    );
  });

  test('does not warn about updating state on an unmounted component when the drawer closes mid-request', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveReset;
    const onReset = jest.fn(() => new Promise((resolve) => { resolveReset = resolve; }));
    const { unmount } = renderWithRepos(['owner/repo-a'], { onReset });

    fireEvent.click(screen.getByRole('button', { name: 'Reset circuit breaker' }));
    unmount();
    resolveReset(true);
    await waitFor(() => expect(onReset).toHaveBeenCalled());

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('unmounted component'),
      expect.anything(),
    );
    consoleErrorSpy.mockRestore();
  });
});
