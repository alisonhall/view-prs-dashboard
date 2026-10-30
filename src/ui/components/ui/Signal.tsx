import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip, useTooltipController } from './Tooltip';

/**
 * One signal in a PR row's fixed slots (UI_REDESIGN_PLAN.md): an icon,
 * optionally with short text ("3/4"), coloured by `tone`, showing its full
 * value in a tooltip. Its icon is named by the first line of `label`.
 *
 * - Inside a <SignalGroup> (`inGroup`), a signal opens on hover only and
 *   isn't focusable: the group is the one keyboard stop, and its focus
 *   tooltip lists every signal in it.
 * - On its own, a signal is focusable, opening on hover or focus, with the
 *   whole label as its description.
 *
 * <EmptySignal /> holds an empty slot open, so an absent signal reads as
 * "no" and the slots line up from row to row.
 */
export type SignalTone = 'success' | 'danger' | 'attention' | 'pending' | 'muted' | 'accent';

export interface SignalProps {
  icon: IconName;
  label: string;
  tone?: SignalTone;
  text?: string;
  size?: number;
  inGroup?: boolean;
}

export function Signal({ icon, label, tone = 'muted', text, size = 16, inGroup = false }: SignalProps) {
  useTooltipController();
  const name = label.split('\n')[0] || label;
  const body = (
    <>
      <Icon name={icon} label={name} size={size} />
      {text && (
        <span className="ui-signal-text" aria-hidden="true">
          {text}
        </span>
      )}
    </>
  );
  if (inGroup) {
    return (
      <span className="ui-signal" data-tone={tone} data-tip={label} data-tip-on="hover">
        {body}
      </span>
    );
  }
  return (
    <Tooltip content={label} focusTarget>
      <span className="ui-signal" data-tone={tone}>
        {body}
      </span>
    </Tooltip>
  );
}

export function EmptySignal() {
  return <span className="ui-signal-empty" aria-hidden="true" />;
}

/**
 * A row cell's signals as one keyboard stop: a named group whose focus
 * tooltip, and screen-reader description, list every value in it
 * (`summary`, one per line). With nothing to list it isn't focusable, so
 * an empty cell costs no Tab press.
 */
export interface SignalGroupProps {
  label: string;
  summary: string[];
  className?: string;
  children: ReactNode;
}

export function SignalGroup({ label, summary, className, children }: SignalGroupProps) {
  const classes = ['ui-signal-group', className].filter(Boolean).join(' ');
  if (summary.length === 0) {
    return (
      <span className={classes} role="group" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Tooltip content={summary.join('\n')} openOn="focus">
      <span className={classes} role="group" aria-label={label} tabIndex={0}>
        {children}
      </span>
    </Tooltip>
  );
}
