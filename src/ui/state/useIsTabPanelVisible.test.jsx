/** @jest-environment jsdom */

const React = require('react');
const { render, act } = require('@testing-library/react');
const { useIsTabPanelVisible, useHasTabPanelBeenVisible } = require('./useIsTabPanelVisible');

function Probe({ panelId, onValue }) {
  const isVisible = useIsTabPanelVisible(panelId);
  onValue(isVisible);
  return null;
}

function StickyProbe({ panelId, onValue }) {
  const hasBeenVisible = useHasTabPanelBeenVisible(panelId);
  onValue(hasBeenVisible);
  return null;
}

describe('useIsTabPanelVisible', () => {
  test('given no matching panel element exists, when rendering, then it defaults to visible', () => {
    const onValue = jest.fn();
    render(<Probe panelId="does-not-exist" onValue={onValue} />);

    expect(onValue).toHaveBeenLastCalledWith(true);
  });

  test('given a panel element that is not hidden, when rendering, then it reports visible', () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-probe-visible';
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<Probe panelId="tab-panel-probe-visible" onValue={onValue} />);

    expect(onValue).toHaveBeenLastCalledWith(true);

    document.body.removeChild(panel);
  });

  test('given a panel element with the hidden attribute set, when rendering, then it reports not visible', () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-probe-hidden';
    panel.hidden = true;
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<Probe panelId="tab-panel-probe-hidden" onValue={onValue} />);

    expect(onValue).toHaveBeenLastCalledWith(false);

    document.body.removeChild(panel);
  });

  test('given a visible panel, when its hidden attribute is set externally, then it reports not visible', async () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-probe-toggle';
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<Probe panelId="tab-panel-probe-toggle" onValue={onValue} />);
    expect(onValue).toHaveBeenLastCalledWith(true);

    await act(async () => {
      panel.hidden = true;
      await Promise.resolve();
    });

    expect(onValue).toHaveBeenLastCalledWith(false);

    document.body.removeChild(panel);
  });

  test('given a hidden panel, when its hidden attribute is cleared externally, then it reports visible again', async () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-probe-untoggle';
    panel.hidden = true;
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<Probe panelId="tab-panel-probe-untoggle" onValue={onValue} />);
    expect(onValue).toHaveBeenLastCalledWith(false);

    await act(async () => {
      panel.hidden = false;
      await Promise.resolve();
    });

    expect(onValue).toHaveBeenLastCalledWith(true);

    document.body.removeChild(panel);
  });
});

describe('useHasTabPanelBeenVisible', () => {
  test('given a panel that starts visible, when rendering, then it reports true immediately', () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-sticky-starts-visible';
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<StickyProbe panelId="tab-panel-sticky-starts-visible" onValue={onValue} />);

    expect(onValue).toHaveBeenLastCalledWith(true);

    document.body.removeChild(panel);
  });

  test('given a panel that starts hidden, when it is never shown, then it keeps reporting false', () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-sticky-stays-hidden';
    panel.hidden = true;
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<StickyProbe panelId="tab-panel-sticky-stays-hidden" onValue={onValue} />);

    expect(onValue).toHaveBeenLastCalledWith(false);

    document.body.removeChild(panel);
  });

  test('given a panel that starts hidden, when it becomes visible and then hidden again, then it stays true (sticky, unlike useIsTabPanelVisible)', async () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-sticky-toggle';
    panel.hidden = true;
    document.body.appendChild(panel);

    const onValue = jest.fn();
    render(<StickyProbe panelId="tab-panel-sticky-toggle" onValue={onValue} />);
    expect(onValue).toHaveBeenLastCalledWith(false);

    await act(async () => {
      panel.hidden = false;
      await Promise.resolve();
    });
    expect(onValue).toHaveBeenLastCalledWith(true);

    await act(async () => {
      panel.hidden = true;
      await Promise.resolve();
    });
    expect(onValue).toHaveBeenLastCalledWith(true); // still true - never flips back

    document.body.removeChild(panel);
  });
});
