import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip, type TooltipPlacement } from './Tooltip';

/**
 * Text button, optionally with a leading icon. `pressed` makes it a toggle
 * (aria-pressed), as for In review / Flagged in the detail pane. The ref
 * is the <button>, for moving focus to it.
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  icon?: IconName;
  variant?: 'default' | 'primary';
  pressed?: boolean;
  type?: 'button' | 'submit';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { icon, variant = 'default', pressed, type = 'button', className, children, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['ui-button', className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
      aria-pressed={pressed}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
});

/**
 * Icon-only button. `label` is required: it's the accessible name, and it
 * also shows as a tooltip on hover/focus (not repeated as a description).
 * `tone="danger"` colours the pressed state red (Flagged). The ref is the
 * <button>.
 */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label' | 'children'> {
  icon: IconName;
  label: string;
  pressed?: boolean;
  tone?: 'default' | 'danger';
  tooltipPlacement?: TooltipPlacement;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, pressed, tone = 'default', tooltipPlacement = 'top', className, ...rest },
  ref,
) {
  return (
    <Tooltip content={label} describe={false} placement={tooltipPlacement}>
      <button
        {...rest}
        ref={ref}
        type="button"
        className={['ui-icon-button', className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-pressed={pressed}
        data-tone={tone === 'default' ? undefined : tone}
      >
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
});
