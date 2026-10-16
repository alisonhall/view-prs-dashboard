/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRefreshAvailableRepoLabels } = require('./useRefreshAvailableRepoLabels.jsx');

function Probe({ onReady }) {
  const refreshAvailableRepoLabels = useRefreshAvailableRepoLabels();
  onReady(refreshAvailableRepoLabels);
  return null;
}

describe('useRefreshAvailableRepoLabels', () => {
  afterEach(() => {
    delete window.refreshAvailableRepoLabels;
  });

  test('given the bridge exists, when calling the hook function, then it forwards straight to window.refreshAvailableRepoLabels with the same args', () => {
    const bridge = jest.fn();
    window.refreshAvailableRepoLabels = bridge;

    let refreshAvailableRepoLabels;
    render(<Probe onReady={(fn) => { refreshAvailableRepoLabels = fn; }} />);
    refreshAvailableRepoLabels('org/repo');

    expect(bridge).toHaveBeenCalledWith('org/repo');
  });

  test('given no bridge is installed yet, when calling the hook function, then it does not throw', () => {
    let refreshAvailableRepoLabels;
    render(<Probe onReady={(fn) => { refreshAvailableRepoLabels = fn; }} />);

    expect(() => refreshAvailableRepoLabels()).not.toThrow();
  });
});
