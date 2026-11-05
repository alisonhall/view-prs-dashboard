import { useEffect, useRef, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';

const isKeyboardFocus = (target: EventTarget) => {
  try {
    return target instanceof Element && target.matches(':focus-visible');
  } catch {
    // A browser without :focus-visible: any focus.
    return true;
  }
};

// The page's one tooltip (tooltip-controller.ts), appended to <body> - so
// outside the section, though the pointer can move onto it to keep it open.
const TOOLTIP_SELECTOR = '.ui-tooltip';
const isOnTooltip = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(TOOLTIP_SELECTOR));

// How long after the pointer and focus leave a section it still counts as
// in use: moving between a row and its menu, or briefly past the edge,
// doesn't let the rows move.
export const SECTION_INTERACTION_RELEASE_MS = 1500;

/**
 * Whether you're working in a section - the pointer over it (or over a
 * tooltip it opened) or keyboard focus in it, its menus included (React
 * passes their events up through the portal) - reported through
 * `onChange` when that changes: at once when you start,
 * SECTION_INTERACTION_RELEASE_MS after you stop. Spread the handlers on
 * the section's element.
 */
export function useSectionInteraction(onChange: ((interacting: boolean) => void) | undefined) {
  const state = useRef({ pointer: false, focus: false, reported: false });
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // While the pointer is on the tooltip: where it goes next.
  const tooltipWatch = useRef<((event: PointerEvent) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = (change: Partial<{ pointer: boolean; focus: boolean }>) => {
    Object.assign(state.current, change);
    const active = state.current.pointer || state.current.focus;
    clearTimeout(releaseTimer.current);
    releaseTimer.current = undefined;
    if (active && !state.current.reported) {
      state.current.reported = true;
      onChangeRef.current?.(true);
    } else if (!active && state.current.reported) {
      releaseTimer.current = setTimeout(() => {
        state.current.reported = false;
        onChangeRef.current?.(false);
      }, SECTION_INTERACTION_RELEASE_MS);
    }
  };

  const stopWatchingTooltip = () => {
    if (tooltipWatch.current) document.removeEventListener('pointerover', tooltipWatch.current, true);
    tooltipWatch.current = null;
  };

  // Gone with the section: it's no longer in use.
  useEffect(
    () => () => {
      stopWatchingTooltip();
      clearTimeout(releaseTimer.current);
      if (state.current.reported) onChangeRef.current?.(false);
    },
    [],
  );

  return {
    onPointerEnter: (event: ReactPointerEvent) => {
      stopWatchingTooltip();
      if (event.pointerType !== 'touch') update({ pointer: true });
    },
    onPointerLeave: (event: ReactPointerEvent) => {
      // Onto the tooltip: still here, until the pointer goes somewhere
      // that's neither the tooltip nor the section (which says so itself).
      // The native event's relatedTarget: React's is the window for an
      // element outside React.
      if (isOnTooltip((event.nativeEvent as MouseEvent).relatedTarget)) {
        const section = event.currentTarget as Element;
        stopWatchingTooltip();
        tooltipWatch.current = (over: PointerEvent) => {
          if (isOnTooltip(over.target)) return;
          stopWatchingTooltip();
          if (!(over.target instanceof Node && section.contains(over.target))) update({ pointer: false });
        };
        document.addEventListener('pointerover', tooltipWatch.current, true);
        return;
      }
      update({ pointer: false });
    },
    // Only focus you moved with the keyboard: a click leaves focus on the
    // control (and closing the detail pane puts it back on the row), which
    // would hold the section long after the pointer and you had left.
    onFocus: (event: FocusEvent) => update({ focus: isKeyboardFocus(event.target) }),
    // Focus moving to another of its controls (a portal's included) is
    // followed straight away by onFocus, which keeps it in use.
    onBlur: () => update({ focus: false }),
  };
}
