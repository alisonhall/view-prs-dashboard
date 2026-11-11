import { forwardRef, useId, type ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip, type TooltipPlacement } from './Tooltip';

/**
 * Text button, optionally with a leading icon. `pressed` makes it a toggle
 * (aria-pressed), as for In review / Flagged in the detail pane. `hint`
 * shows as a tooltip, and is its description for screen readers. The ref
 * is the <button>, for moving focus to it.
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  icon?: IconName;
  variant?: 'default' | 'primary';
  pressed?: boolean;
  type?: 'button' | 'submit';
  hint?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { icon, variant = 'default', pressed, type = 'button', hint, className, children, ...rest },
  ref,
) {
  const button = (
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
  return hint ? <Tooltip content={hint}>{button}</Tooltip> : button;
});

/**
 * Icon-only button. `label` is required: it's the accessible name, and it
 * also shows as a tooltip on hover/focus (not repeated as a description).
 * `hint` adds a line under it in the tooltip, and is the button's
 * description for screen readers (e.g. "click again to undo it").
 * `tone="danger"` colours the pressed state red (Flagged). `shortcut`
 * is a key that does the same (Ack's "a"): shown after the label in the
 * tooltip, and its aria-keyshortcuts. The ref is the <button>.
 */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label' | 'children'> {
  icon: IconName;
  label: string;
  pressed?: boolean;
  tone?: 'default' | 'danger';
  tooltipPlacement?: TooltipPlacement;
  hint?: string;
  shortcut?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, pressed, tone = 'default', tooltipPlacement = 'top', hint, shortcut, className, ...rest },
  ref,
) {
  const hintId = useId();
  const title = shortcut ? `${label} (${shortcut.toUpperCase()})` : label;
  return (
    <>
      <Tooltip content={hint ? `${title}
${hint}` : title} describe={false} placement={tooltipPlacement}>
        <button
          {...rest}
          ref={ref}
          type="button"
          className={['ui-icon-button', className].filter(Boolean).join(' ')}
          aria-label={label}
          aria-describedby={hint ? hintId : rest['aria-describedby']}
          aria-pressed={pressed}
          aria-keyshortcuts={shortcut}
          data-tone={tone === 'default' ? undefined : tone}
        >
          <Icon name={icon} />
        </button>
      </Tooltip>
      {hint && (
        <span id={hintId} className="ui-visually-hidden">
          {hint}
        </span>
      )}
    </>
  );
});
