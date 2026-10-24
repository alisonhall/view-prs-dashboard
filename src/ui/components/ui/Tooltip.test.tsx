/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeTooltipPosition, Tooltip, TOOLTIP_CLOSE_DELAY_MS } from './Tooltip';
import { Icon } from './Icon';

const VIEWPORT = { width: 1000, height: 800 };
const BUBBLE = { width: 200, height: 40 };
const anchorAt = (left: number, top: number, width = 20, height = 20) => ({
  left,
  top,
  width,
  bottom: top + height,
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Tooltip', () => {
  test('is hidden until the trigger is hovered, and closes shortly after the pointer leaves', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Checks: PASS">
          <button type="button">CHK</button>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'CHK' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Checks: PASS');

    await user.hover(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  test('stays open while the pointer moves onto the bubble, then closes when it leaves', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Notes: 2 comments · difficulty Hard · story US12345">
          <button type="button">Notes</button>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </>,
    );

    await user.hover(screen.getByRole('button', { name: 'Notes' }));
    await user.hover(screen.getByRole('tooltip'));
    await wait(TOOLTIP_CLOSE_DELAY_MS * 2);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  test('shows on keyboard focus and describes the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Mergeable: YES (no conflicts)">
        <button type="button">MRG</button>
      </Tooltip>,
    );

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'MRG' });
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeVisible();
    expect(trigger).toHaveAccessibleDescription('Mergeable: YES (no conflicts)');
  });

  test('describes the trigger even while closed, so the description is there whenever it is read', () => {
    render(
      <Tooltip content="Checks: FAIL">
        <button type="button">CHK</button>
      </Tooltip>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CHK' })).toHaveAccessibleDescription('Checks: FAIL');
  });

  test('keeps a trigger’s existing description', () => {
    render(
      <>
        <span id="hint">Hint</span>
        <Tooltip content="More">
          <button type="button" aria-describedby="hint">
            Go
          </button>
        </Tooltip>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Go' })).toHaveAccessibleDescription('Hint More');
  });

  test('Escape closes it when opened by focus, until the next focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Flagged">
        <button type="button">Flag</button>
      </Tooltip>,
    );

    await user.tab();
    expect(screen.getByRole('tooltip')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab({ shift: true });
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  test('Escape closes it when opened by hover, with focus elsewhere, until the next hover', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Flagged">
          <button type="button">Flag</button>
        </Tooltip>
        <button type="button">Elsewhere</button>
      </>,
    );

    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await user.hover(screen.getByRole('button', { name: 'Flag' }));
    expect(screen.getByRole('tooltip')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Elsewhere' }));
    await wait(TOOLTIP_CLOSE_DELAY_MS * 2);
    await user.hover(screen.getByRole('button', { name: 'Flag' }));
    expect(screen.getByRole('tooltip')).toBeVisible();
  });

  test('the first Escape only closes the tooltip; later ones reach the page', async () => {
    const user = userEvent.setup();
    const pageEscape = jest.fn();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') pageEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    try {
      render(
        <Tooltip content="Flagged">
          <button type="button">Flag</button>
        </Tooltip>,
      );

      await user.tab();
      await user.keyboard('{Escape}');
      expect(pageEscape).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');
      expect(pageEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', onKeyDown);
    }
  });

  test('renders the bubble at <body>, outside a clipping ancestor', async () => {
    const user = userEvent.setup();
    render(
      <div data-testid="section" style={{ overflow: 'hidden' }}>
        <Tooltip content="Checks: PASS">
          <button type="button">CHK</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole('button', { name: 'CHK' }));
    const bubble = screen.getByRole('tooltip');
    expect(bubble.parentElement).toBe(document.body);
    expect(screen.getByTestId('section')).not.toContainElement(bubble);
  });

  test('places the bubble from the trigger’s position on screen', async () => {
    const user = userEvent.setup();
    const rects = new Map<string, Partial<DOMRect>>([
      ['ui-tooltip-anchor', { left: 400, top: 300, width: 20, height: 20, bottom: 320, right: 420 }],
      ['ui-tooltip', { left: 0, top: 0, width: 200, height: 40, bottom: 40, right: 200 }],
    ]);
    const spy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const key = [...rects.keys()].find((name) => this.classList.contains(name));
      return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0, toJSON: () => ({}), ...(key ? rects.get(key) : {}) } as DOMRect;
    });
    try {
      render(
        <Tooltip content="Checks: PASS">
          <button type="button">CHK</button>
        </Tooltip>,
      );

      await user.hover(screen.getByRole('button', { name: 'CHK' }));
      const bubble = screen.getByRole('tooltip');
      // Centred over the trigger (410 - 100), 8px above it (300 - 8 - 40).
      expect(bubble).toHaveStyle({ left: '310px', top: '252px' });
      expect(bubble).toHaveAttribute('data-placement', 'top');
    } finally {
      spy.mockRestore();
    }
  });

  test('wraps non-focusable content in a focusable target when asked', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={'Needs attention\nNew commits after your last review'} focusTarget>
        <Icon name="alert" label="Needs attention" />
      </Tooltip>,
    );

    await user.tab();
    const target = screen.getByRole('img', { name: 'Needs attention' }).parentElement;
    expect(target).toHaveFocus();
    expect(target).toHaveAccessibleDescription(/^Needs attention\s+New commits after your last review$/);
  });

  test('shows without describing when describe is false', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Update PR #1" describe={false}>
        <button type="button" aria-label="Update PR #1" />
      </Tooltip>,
    );

    const button = screen.getByRole('button', { name: 'Update PR #1' });
    await user.hover(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Update PR #1');
    expect(button).not.toHaveAttribute('aria-describedby');
  });
});

describe('computeTooltipPosition', () => {
  test('centres the bubble above the trigger when there is room', () => {
    expect(computeTooltipPosition(anchorAt(400, 300), BUBBLE, VIEWPORT, 'top')).toEqual({
      top: 252,
      left: 310,
      placement: 'top',
    });
  });

  test('flips below when there is no room above', () => {
    expect(computeTooltipPosition(anchorAt(400, 20), BUBBLE, VIEWPORT, 'top')).toEqual({
      top: 48,
      left: 310,
      placement: 'bottom',
    });
  });

  test('flips above when below was asked for but there is no room', () => {
    expect(computeTooltipPosition(anchorAt(400, 760), BUBBLE, VIEWPORT, 'bottom')).toMatchObject({ placement: 'top' });
  });

  test('keeps the preferred side when neither side fits', () => {
    const tall = { width: 200, height: 790 };
    expect(computeTooltipPosition(anchorAt(400, 300), tall, VIEWPORT, 'top')).toMatchObject({ placement: 'top' });
  });

  test('stays inside the window at the left and right edges', () => {
    expect(computeTooltipPosition(anchorAt(0, 300), BUBBLE, VIEWPORT, 'top').left).toBe(8);
    expect(computeTooltipPosition(anchorAt(990, 300, 10), BUBBLE, VIEWPORT, 'top').left).toBe(792);
  });
});
