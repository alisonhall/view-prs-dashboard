import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';

/**
 * Icon button that opens a menu of actions, following the WAI-ARIA menu
 * button pattern (the row's "More" actions: Add label, View JSON).
 * - Arrow keys, Home and End move between items; Enter or Space chooses.
 * - Escape closes and returns focus to the button; Tab, or a click
 *   outside, closes.
 * - Items can sit in a labelled group (Add label > each label). A group
 *   with no items shows `emptyText` instead.
 *
 * The menu is portaled to <body> with fixed positioning (like Tooltip), so
 * the PR sections' `overflow: hidden` can't clip it. It opens below the
 * button, right-aligned, and flips above or shifts to stay in the window.
 */
export interface MenuItemDef {
  id: string;
  label: string;
  icon?: IconName;
  onSelect: () => void;
}

export interface MenuGroupDef {
  id: string;
  label: string;
  items: MenuItemDef[];
  emptyText?: string;
}

export type MenuEntry = MenuItemDef | MenuGroupDef;

const isGroup = (entry: MenuEntry): entry is MenuGroupDef => 'items' in entry;

export interface MenuButtonProps {
  icon: IconName;
  // The button's accessible name, also its tooltip.
  label: string;
  entries: MenuEntry[];
}

const GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

export function computeMenuPosition(
  button: Pick<DOMRect, 'top' | 'bottom' | 'right'>,
  menu: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const fitsBelow = button.bottom + GAP_PX + menu.height <= viewport.height - VIEWPORT_MARGIN_PX;
  const fitsAbove = button.top - GAP_PX - menu.height >= VIEWPORT_MARGIN_PX;
  const top = !fitsBelow && fitsAbove ? button.top - GAP_PX - menu.height : button.bottom + GAP_PX;
  const rightAligned = button.right - menu.width;
  const maxLeft = viewport.width - VIEWPORT_MARGIN_PX - menu.width;
  return { top, left: Math.max(VIEWPORT_MARGIN_PX, Math.min(rightAligned, maxLeft)) };
}

export function MenuButton({ icon, label, entries }: MenuButtonProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<HTMLButtonElement[]>([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // Which item to focus once the menu opens: first, last, or none.
  const [initialFocus, setInitialFocus] = useState<'first' | 'last'>('first');

  const flatItems = entries.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]));

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    setPosition(
      computeMenuPosition(button.getBoundingClientRect(), menu.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    updatePosition();
    const items = itemRefs.current;
    (initialFocus === 'last' ? items[items.length - 1] : items[0])?.focus();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, initialFocus, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, close]);

  const openMenu = (focus: 'first' | 'last') => {
    setInitialFocus(focus);
    setOpen(true);
  };

  const handleButtonKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu('last');
    }
  };

  const focusItem = (index: number) => {
    const items = itemRefs.current;
    if (!items.length) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    const items = itemRefs.current;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const choose = (item: MenuItemDef) => {
    close(true);
    item.onSelect();
  };

  itemRefs.current = [];
  const renderItem = (item: MenuItemDef) => (
    <button
      key={item.id}
      ref={(node) => {
        if (node) itemRefs.current.push(node);
      }}
      type="button"
      role="menuitem"
      tabIndex={-1}
      className="ui-menu-item"
      onClick={() => choose(item)}
    >
      {item.icon && <Icon name={item.icon} />}
      {item.label}
    </button>
  );

  const menuStyle: CSSProperties = position
    ? { top: position.top, left: position.left }
    : { top: 0, left: 0, visibility: 'hidden' };

  return (
    <>
      <Tooltip content={label} describe={false} disabled={open}>
        <button
          ref={buttonRef}
          type="button"
          className="ui-icon-button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close(false) : openMenu('first'))}
          onKeyDown={handleButtonKeyDown}
        >
          <Icon name={icon} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="ui-menu"
            style={menuStyle}
            onKeyDown={handleMenuKeyDown}
          >
            {entries.map((entry) =>
              isGroup(entry) ? (
                <div key={entry.id} role="group" aria-label={entry.label} className="ui-menu-group">
                  <div className="ui-menu-group-label" aria-hidden="true">
                    {entry.label}
                  </div>
                  {entry.items.length > 0 ? (
                    entry.items.map(renderItem)
                  ) : (
                    <div className="ui-menu-empty">{entry.emptyText || 'Nothing here'}</div>
                  )}
                </div>
              ) : (
                <Fragment key={entry.id}>{renderItem(entry)}</Fragment>
              ),
            )}
            {flatItems.length === 0 && <div className="ui-menu-empty">No actions</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
