/**
 * One tooltip for the whole page (UI_REDESIGN_PLAN.md). Elements opt in
 * with attributes instead of each owning a component with its own state,
 * which mattered once every signal in every row had a tooltip:
 * - data-tip: the text (newlines start new lines)
 * - data-tip-on: "hover" or "focus" to open on only one of them
 * - data-tip-placement: "bottom" to prefer below (default above)
 * - data-tip-disabled: present while it should stay closed
 *
 * The bubble is a single element appended to <body> (role="tooltip"), with
 * fixed positioning so no ancestor's overflow can clip it. It flips
 * above/below and stays inside the window. Meets WCAG 1.4.13:
 * - the pointer can move onto the bubble without it closing
 * - Escape closes it from anywhere, until the next hover or focus; that
 *   Escape is taken, so it doesn't also close a dialog behind it
 *
 * Hover wins over focus: hovering one signal inside a focused group shows
 * that signal, then the group's again when the pointer leaves.
 *
 * Listeners are installed while at least one user is mounted
 * (installTooltipController's refcount); with none, the bubble goes too.
 */
export type TooltipPlacement = 'top' | 'bottom';

const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
// How long the bubble stays after the pointer leaves, so it can cross the
// gap onto the bubble.
export const TOOLTIP_CLOSE_DELAY_MS = 120;

export interface BubblePosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

export function computeTooltipPosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  bubble: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  preferred: TooltipPlacement,
): BubblePosition {
  const fitsAbove = anchor.top - GAP_PX - bubble.height >= VIEWPORT_MARGIN_PX;
  const fitsBelow = anchor.bottom + GAP_PX + bubble.height <= viewport.height - VIEWPORT_MARGIN_PX;
  let placement = preferred;
  if (preferred === 'top' && !fitsAbove && fitsBelow) placement = 'bottom';
  if (preferred === 'bottom' && !fitsBelow && fitsAbove) placement = 'top';

  const top = placement === 'top' ? anchor.top - GAP_PX - bubble.height : anchor.bottom + GAP_PX;
  const centred = anchor.left + anchor.width / 2 - bubble.width / 2;
  const maxLeft = viewport.width - VIEWPORT_MARGIN_PX - bubble.width;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(centred, maxLeft));
  return { top, left, placement };
}

let installs = 0;
let bubble: HTMLDivElement | null = null;
let shown: HTMLElement | null = null;
let hoverTarget: HTMLElement | null = null;
let focusTarget: HTMLElement | null = null;
let dismissed: HTMLElement | null = null;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

// The nearest opted-in element at or above `node` that opens for `mode`.
// A disabled one still counts as hovered/focused, so it shows as soon as
// it's enabled (render() leaves it out meanwhile).
const tipTargetFrom = (node: EventTarget | null, mode: 'hover' | 'focus'): HTMLElement | null => {
  let element = node instanceof Element ? (node.closest('[data-tip]') as HTMLElement | null) : null;
  while (element) {
    const on = element.getAttribute('data-tip-on');
    if (on === null || on === mode) return element;
    element = element.parentElement?.closest('[data-tip]') as HTMLElement | null;
  }
  return null;
};

const isUsable = (element: HTMLElement | null): element is HTMLElement =>
  Boolean(element && element.isConnected && !element.hasAttribute('data-tip-disabled') && element.getAttribute('data-tip'));

const position = () => {
  if (!bubble || !shown) return;
  const preferred = shown.getAttribute('data-tip-placement') === 'bottom' ? 'bottom' : 'top';
  const result = computeTooltipPosition(
    shown.getBoundingClientRect(),
    bubble.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
    preferred,
  );
  bubble.style.top = `${result.top}px`;
  bubble.style.left = `${result.left}px`;
  bubble.style.visibility = '';
  bubble.setAttribute('data-placement', result.placement);
};

const ensureBubble = (): HTMLDivElement => {
  if (bubble) return bubble;
  bubble = document.createElement('div');
  bubble.className = 'ui-tooltip';
  bubble.setAttribute('role', 'tooltip');
  bubble.id = 'ui-tooltip-bubble';
  document.body.appendChild(bubble);
  return bubble;
};

const removeBubble = () => {
  bubble?.remove();
  bubble = null;
  shown = null;
};

// Shows whatever should be shown now: the hovered element, else the
// focused one, unless that's the one Escape dismissed.
const render = () => {
  let next: HTMLElement | null = isUsable(hoverTarget) ? hoverTarget : isUsable(focusTarget) ? focusTarget : null;
  if (next && next === dismissed) next = null;
  if (!next) {
    removeBubble();
    return;
  }
  const element = ensureBubble();
  element.textContent = next.getAttribute('data-tip');
  if (next !== shown) {
    // Off-screen until measured, so it never flashes at the wrong place.
    element.style.top = '0px';
    element.style.left = '0px';
    element.style.visibility = 'hidden';
  }
  shown = next;
  position();
};

const cancelClose = () => clearTimeout(closeTimer);
const scheduleHoverEnd = () => {
  cancelClose();
  closeTimer = setTimeout(() => {
    hoverTarget = null;
    render();
  }, TOOLTIP_CLOSE_DELAY_MS);
};

const onMouseOver = (event: MouseEvent) => {
  if (bubble && bubble.contains(event.target as Node)) {
    cancelClose();
    return;
  }
  const target = tipTargetFrom(event.target, 'hover');
  if (!target) {
    if (hoverTarget) scheduleHoverEnd();
    return;
  }
  cancelClose();
  if (target !== hoverTarget) {
    // A new hover (including back onto the one Escape closed) reopens.
    dismissed = null;
    hoverTarget = target;
    render();
  }
};

// Leaving the window (no element to go to) ends the hover too.
const onMouseOut = (event: MouseEvent) => {
  if (!event.relatedTarget && hoverTarget) scheduleHoverEnd();
};

const onFocusIn = (event: FocusEvent) => {
  const target = tipTargetFrom(event.target, 'focus');
  if (target !== focusTarget) dismissed = null;
  focusTarget = target;
  render();
};

const onFocusOut = (event: FocusEvent) => {
  if (focusTarget && event.relatedTarget instanceof Node && focusTarget.contains(event.relatedTarget)) return;
  focusTarget = null;
  render();
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !shown) return;
  // A tooltip turned off since it opened (its button's menu opened) just
  // goes, without taking the Escape the menu needs.
  if (!isUsable(shown)) {
    render();
    return;
  }
  event.stopPropagation();
  dismissed = shown;
  render();
};

const onViewportChange = () => {
  if (shown && !shown.isConnected) render();
  else position();
};

/** Re-checks what should be shown, after a data-tip attribute changed. */
export function refreshTooltips() {
  if (installs > 0) render();
}

/** Installs the listeners for one more user; returns its uninstall. */
export function installTooltipController(): () => void {
  if (typeof document === 'undefined') return () => {};
  installs += 1;
  if (installs === 1) {
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    // Capture, so the first Escape closes the tooltip before anything else
    // (a drawer, a dialog) acts on it.
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
  }
  let uninstalled = false;
  return () => {
    if (uninstalled) return;
    uninstalled = true;
    installs -= 1;
    if (installs > 0) return;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    cancelClose();
    hoverTarget = null;
    focusTarget = null;
    dismissed = null;
    removeBubble();
  };
}
