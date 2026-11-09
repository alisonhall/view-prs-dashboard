import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { computeMenuPosition } from '../ui/MenuButton';

const VIEWPORT_MARGIN_PX = 8;

export interface HeaderPopover {
  isOpen: boolean;
  // returnFocusTo: where Esc puts the focus back, if not the button (the
  // shortcuts list opened by its key, from wherever you were).
  open: (returnFocusTo?: HTMLElement | null) => void;
  close: (returnFocus: boolean) => void;
  toggle: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
  panelRef: RefObject<HTMLDivElement>;
  panelStyle: CSSProperties;
}

/**
 * A button's popover (the header's ActivityPopover, AddPrPopover and
 * KeyboardShortcutsPopover, the table toolbar's PrLegendPopover): a
 * non-modal dialog under the button (fixed, kept in the window like the row
 * menu, following it on resize). Esc (with focus in it), a click outside
 * it or focus moving outside it (Tab) closes it; Esc returns focus to the
 * button (or where open() was told). Scrolling doesn't: it stays where it
 * is in the window. Once placed, focuses getFocusTarget()'s element - the
 * panel itself by default.
 */
export function useHeaderPopover(getFocusTarget?: () => HTMLElement | null): HeaderPopover {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusToRef = useRef<HTMLElement | null>(null);
  const getFocusTargetRef = useRef(getFocusTarget);
  getFocusTargetRef.current = getFocusTarget;

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    const returnFocusTo = returnFocusToRef.current;
    returnFocusToRef.current = null;
    if (!returnFocus) return;
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
    else buttonRef.current?.focus();
  }, []);
  const open = useCallback((returnFocusTo: HTMLElement | null = null) => {
    returnFocusToRef.current = returnFocusTo;
    setIsOpen(true);
  }, []);
  const toggle = useCallback(() => setIsOpen((previous) => !previous), []);

  const place = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const next = computeMenuPosition(button.getBoundingClientRect(), panel.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setPosition((previous) => (previous && previous.top === next.top && previous.left === next.left ? previous : next));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return undefined;
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen, place]);

  // Focused once placed: until then it's visibility: hidden, which can't
  // take focus.
  const isPlaced = position !== null;
  useEffect(() => {
    if (isOpen && isPlaced) (getFocusTargetRef.current?.() || panelRef.current)?.focus();
  }, [isOpen, isPlaced]);

  // Esc on window, so a true modal above (the PR JSON modal, listening on
  // document) can take it first and stop it here.
  useEffect(() => {
    if (!isOpen) return undefined;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(panelRef.current?.contains(target) || buttonRef.current?.contains(target));
    // Only while focus is in it (left open with focus elsewhere, Esc there
    // is for that - a search box, a drawer), and not when something has
    // handled the Esc already (a modal's focus trap).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && isInside(document.activeElement)) close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) close(false);
    };
    // Focus moving to something else (Tab out to the Settings button, say).
    // Not the window losing focus (no relatedTarget): switching apps keeps
    // it open.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget && !isInside(event.relatedTarget)) close(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [isOpen, close]);

  const panelStyle: CSSProperties = position
    ? { top: position.top, left: position.left, maxHeight: `calc(100vh - ${position.top + VIEWPORT_MARGIN_PX}px)` }
    : { visibility: 'hidden' };

  return { isOpen, open, close, toggle, buttonRef, panelRef, panelStyle };
}
