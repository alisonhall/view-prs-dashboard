import { cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { installTooltipController, refreshTooltips, type TooltipPlacement } from './tooltip-controller';

export { computeTooltipPosition, TOOLTIP_CLOSE_DELAY_MS, type TooltipPlacement } from './tooltip-controller';

/**
 * Shows `content` while the pointer is over, or keyboard focus is inside,
 * its child (UI_REDESIGN_PLAN.md: every icon's full value on hover/focus).
 * The bubble itself is the page's one shared tooltip (tooltip-controller.ts:
 * WCAG 1.4.13 behaviour, positioning, Escape); this only marks the child
 * with data-tip attributes and holds the screen-reader description, a
 * hidden element the child's aria-describedby points at, always present
 * so the description is there whenever it's computed.
 *
 * - The child should be focusable. For content that isn't (a signal icon,
 *   a count), pass `focusTarget` to wrap it in a focusable span instead.
 * - `describe={false}` when `content` just repeats the child's own
 *   accessible name (an icon button's label), so it isn't read twice.
 * - `disabled` keeps it closed, e.g. while the trigger's own menu is open.
 * - `openOn` "hover" or "focus" to open on only one of them: a signal
 *   group opens on focus (listing all its signals) while each signal in it
 *   opens on hover.
 */
export interface TooltipProps {
  content: string;
  children: ReactNode;
  placement?: TooltipPlacement;
  focusTarget?: boolean;
  describe?: boolean;
  disabled?: boolean;
  openOn?: 'both' | 'hover' | 'focus';
}

type TipProps = {
  'data-tip'?: string;
  'data-tip-on'?: string;
  'data-tip-placement'?: string;
  'data-tip-disabled'?: string;
  'aria-describedby'?: string;
};

/** Installs the shared tooltip listeners while the caller is mounted. */
export function useTooltipController() {
  useEffect(() => installTooltipController(), []);
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  focusTarget = false,
  describe = true,
  disabled = false,
  openOn = 'both',
}: TooltipProps) {
  useTooltipController();
  // The shared tooltip reads these attributes on events; when they change
  // under an open (or disabled-but-hovered) tooltip, have it look again.
  // Not on mount: a new trigger isn't the one showing yet, and a table of
  // them mounting would each re-measure the open bubble.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    refreshTooltips();
  }, [content, disabled]);
  const descriptionId = useId();
  const describedBy = describe ? descriptionId : undefined;
  const tipProps: TipProps = {
    'data-tip': content,
    'data-tip-on': openOn === 'both' ? undefined : openOn,
    'data-tip-placement': placement === 'top' ? undefined : placement,
    'data-tip-disabled': disabled ? '' : undefined,
  };

  let trigger: ReactNode;
  if (focusTarget) {
    trigger = (
      <span className="ui-tooltip-target" tabIndex={0} aria-describedby={describedBy} {...tipProps}>
        {children}
      </span>
    );
  } else if (isValidElement<TipProps>(children)) {
    const existing = children.props['aria-describedby'];
    trigger = cloneElement(children as ReactElement<TipProps>, {
      ...tipProps,
      'aria-describedby': describedBy ? (existing ? `${existing} ${describedBy}` : describedBy) : existing,
    });
  } else {
    trigger = (
      <span aria-describedby={describedBy} {...tipProps}>
        {children}
      </span>
    );
  }

  return (
    <>
      {trigger}
      {describedBy && (
        <span id={descriptionId} hidden>
          {content}
        </span>
      )}
    </>
  );
}
