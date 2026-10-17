/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillTabAutoRefresh } = require('./useBackfillTabAutoRefresh.jsx');

function Probe({ triggerBackfillTabLoad }) {
  useBackfillTabAutoRefresh(triggerBackfillTabLoad);
  return null;
}

describe('useBackfillTabAutoRefresh', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="tab-panel-backfill" hidden></div>';
  });

  test('given the Backfill tab is hidden, when mounted, then it still triggers one eager load', () => {
    const triggerBackfillTabLoad = jest.fn();
    render(<Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />);

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });

  test('given the Backfill tab becomes visible after mount, when its hidden attribute flips, then it triggers another load', async () => {
    const triggerBackfillTabLoad = jest.fn();
    render(<Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />);
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.getElementById('tab-panel-backfill').hidden = false;
      await Promise.resolve();
    });

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);
  });

  test('given the Backfill tab becomes hidden again after being visible, when its hidden attribute flips back, then it does not trigger another load', async () => {
    const triggerBackfillTabLoad = jest.fn();
    render(<Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />);

    await act(async () => {
      document.getElementById('tab-panel-backfill').hidden = false;
      await Promise.resolve();
    });
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);

    await act(async () => {
      document.getElementById('tab-panel-backfill').hidden = true;
      await Promise.resolve();
    });

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);
  });

  test('given the Backfill tab is already visible at mount, when mounted, then it triggers exactly one eager load (not two)', () => {
    document.getElementById('tab-panel-backfill').hidden = false;
    const triggerBackfillTabLoad = jest.fn();
    render(<Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />);

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });
});
