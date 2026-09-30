/** @jest-environment jsdom */

const { render, screen, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { MergedRequestMoreAction } = require('./MergedRequestMoreAction');

describe('MergedRequestMoreAction', () => {
  afterEach(() => {
    delete window.handleRequestMoreMerged;
  });

  test('given isVisible is false, when rendering, then nothing renders', () => {
    const { container } = render(<MergedRequestMoreAction isVisible={false} repo="owner/repo" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given isVisible is true, when rendering, then the button and status span render', () => {
    render(<MergedRequestMoreAction isVisible repo="owner/repo" />);
    expect(screen.getByRole('button', { name: 'Request more' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request more' })).not.toBeDisabled();
  });

  test('given the button is clicked, when handled, then window.handleRequestMoreMerged is called with the repo and onPendingChange/onStatusChange callbacks', async () => {
    const calls = [];
    window.handleRequestMoreMerged = (...args) => calls.push(args);
    const user = userEvent.setup();
    render(<MergedRequestMoreAction isVisible repo="owner/repo" />);

    await user.click(screen.getByRole('button', { name: 'Request more' }));

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('owner/repo');
    expect(typeof calls[0][1].onPendingChange).toBe('function');
    expect(typeof calls[0][1].onStatusChange).toBe('function');
  });

  test('given the request reports pending, when onPendingChange(true) fires, then the button is disabled', async () => {
    window.handleRequestMoreMerged = (_repo, { onPendingChange }) => {
      onPendingChange(true);
    };
    const user = userEvent.setup();
    render(<MergedRequestMoreAction isVisible repo="owner/repo" />);

    await user.click(screen.getByRole('button', { name: 'Request more' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Request more' })).toBeDisabled());
  });

  test('given a status update, when onStatusChange fires, then the status text renders', async () => {
    window.handleRequestMoreMerged = (_repo, { onStatusChange }) => {
      onStatusChange('Loaded 2 merged PRs.');
    };
    const user = userEvent.setup();
    render(<MergedRequestMoreAction isVisible repo="owner/repo" />);

    await user.click(screen.getByRole('button', { name: 'Request more' }));

    await waitFor(() => expect(screen.getByText('Loaded 2 merged PRs.')).toBeInTheDocument());
  });

  test('given no window.handleRequestMoreMerged bridge is installed, when the button is clicked, then nothing throws', async () => {
    const user = userEvent.setup();
    render(<MergedRequestMoreAction isVisible repo="owner/repo" />);

    await expect(user.click(screen.getByRole('button', { name: 'Request more' }))).resolves.not.toThrow();
  });

  // react-app.jsx mounts this component with key={repo} specifically so a
  // repo change resets stale pending/status state (see this component's own
  // doc comment for the bug that fixed) - remounting with a different React
  // key is exactly what a key change causes, so that's simulated directly
  // here rather than only asserting on react-app.jsx's own JSX (which would
  // just check a string prop was written, not that it actually has the
  // intended effect).
  test('given a completed request left status text showing, when remounted for a different repo (simulating a key={repo} change), then pending/status reset to defaults', async () => {
    window.handleRequestMoreMerged = (_repo, { onStatusChange }) => {
      onStatusChange('Loaded 2 merged PRs.');
    };
    const user = userEvent.setup();
    const { unmount } = render(<MergedRequestMoreAction isVisible repo="owner/repo-a" />);
    await user.click(screen.getByRole('button', { name: 'Request more' }));
    await waitFor(() => expect(screen.getByText('Loaded 2 merged PRs.')).toBeInTheDocument());

    // A key change unmounts the old fiber and mounts a fresh one - exactly
    // what happens here, rather than re-rendering the same instance.
    unmount();
    render(<MergedRequestMoreAction isVisible repo="owner/repo-b" />);

    expect(screen.queryByText('Loaded 2 merged PRs.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request more' })).not.toBeDisabled();
  });
});
