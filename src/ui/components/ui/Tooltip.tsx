import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Shows `content` while the pointer is over, or keyboard focus is inside,
 * its child (UI_REDESIGN_PLAN.md: every icon's full value on hover/focus).
 * Meets WCAG 1.4.13:
 * - the pointer can move onto the bubble without it closing
 * - Escape closes it from anywhere, until the next hover or focus
 *
 * The visible bubble is portaled to <body> with fixed positioning, so an
 * ancestor's `overflow: hidden` (the PR sections) can't clip it. It's
 * placed from the trigger's position, flipped below when there's no room
 * above (or the other way round), and kept inside the window. Screen
 * readers get the text from a hidden element next to the trigger, which
 * `aria-describedby` points at; it's always present, so the description
 * is there whenever it's computed.
 *
 * - The child should be focusable. For content that isn't (a signal icon,
 *   a count), pass `focusTarget` to wrap it in a focusable span instead.
 * - Pass `describe={false}` when `content` just repeats the child's own
 *   accessible name (an icon button's label), so it isn't read twice.
 */
export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: TooltipPlacement;
  focusTarget?: boolean;
  describe?: boolean;
  className?: string;
}

type DescribableProps = { 'aria-describedby'?: string };

// Gap between trigger and bubble, and the minimum distance from the
// window's edges.
const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
// How long the bubble stays after the pointer leaves the trigger, so it
// can cross the gap onto the bubble.
export const TOOLTIP_CLOSE_DELAY_MS = 120;

interface BubblePosition {
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

export function Tooltip({
  content,
  children,
  placement = 'top',
  focusTarget = false,
  describe = true,
  className,
}: TooltipProps) {
  const descriptionId = useId();
  const bubbleId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<BubblePosition | null>(null);
  const open = (hovered || focused) && !dismissed;
  const describedBy = describe ? descriptionId : undefined;

  const cancelClose = () => clearTimeout(closeTimerRef.current);
  const startHover = () => {
    cancelClose();
    if (!hovered) setDismissed(false);
    setHovered(true);
  };
  const scheduleHoverEnd = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setHovered(false), TOOLTIP_CLOSE_DELAY_MS);
  };
  useEffect(() => cancelClose, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;
    setPosition(
      computeTooltipPosition(
        anchor.getBoundingClientRect(),
        bubble.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        placement,
      ),
    );
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    updatePosition();
    // Capture, so scrolling any container (not just the window) moves it.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition, content]);

  useEffect(() => {
    if (!open) return undefined;
    // Capture on document, so the first Escape closes the tooltip before
    // anything else (a drawer, a dialog) acts on it.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setDismissed(true);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  let trigger: ReactNode;
  if (focusTarget) {
    trigger = (
      <span className="ui-tooltip-target" tabIndex={0} aria-describedby={describedBy}>
        {children}
      </span>
    );
  } else if (describedBy && isValidElement<DescribableProps>(children)) {
    const existing = children.props['aria-describedby'];
    trigger = cloneElement(children as ReactElement<DescribableProps>, {
      'aria-describedby': existing ? `${existing} ${describedBy}` : describedBy,
    });
  } else {
    trigger = children;
  }

  // Off-screen until measured, so it never flashes at the wrong place.
  const bubbleStyle: CSSProperties = position
    ? { top: position.top, left: position.left }
    : { top: 0, left: 0, visibility: 'hidden' };

  return (
    <>
      <span
        ref={anchorRef}
        className={['ui-tooltip-anchor', className].filter(Boolean).join(' ')}
        onMouseEnter={startHover}
        onMouseLeave={scheduleHoverEnd}
        onFocus={() => {
          if (!focused) setDismissed(false);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
      >
        {trigger}
        {describedBy && (
          <span id={descriptionId} hidden>
            {content}
          </span>
        )}
      </span>
      {open &&
        createPortal(
          <span
            ref={bubbleRef}
            id={bubbleId}
            role="tooltip"
            className="ui-tooltip"
            data-placement={position?.placement ?? placement}
            style={bubbleStyle}
            onMouseEnter={startHover}
            onMouseLeave={scheduleHoverEnd}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
