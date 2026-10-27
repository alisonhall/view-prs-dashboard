import { forwardRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Toggle chip for filters (Activity event types, Conversations filters).
 * Always a toggle: `pressed` drives aria-pressed and the filled style. The
 * ref is the <button>.
 */
export interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: IconName;
  count?: number;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { pressed, onClick, children, icon, count },
  ref,
) {
  return (
    <button ref={ref} type="button" className="ui-chip" aria-pressed={pressed} onClick={onClick}>
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
