import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Toggle chip for filters (Activity event types, Conversations filters).
 * Always a toggle: `pressed` drives aria-pressed and the filled style. The
 * ref is the <button>. Other attributes go on it too: a Tooltip around a
 * chip adds its data-tip and aria-describedby.
 */
export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type' | 'aria-pressed'> {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: IconName;
  count?: number;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { pressed, onClick, children, icon, count, className, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      className={['ui-chip', className].filter(Boolean).join(' ')}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
      {count !== undefined && <span className="ui-chip-count">{count}</span>}
    </button>
  );
});

export interface ChipGroupProps {
  label: string;
  children: ReactNode;
}

export function ChipGroup({ label, children }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="ui-chip-group">
      {children}
    </div>
  );
}
