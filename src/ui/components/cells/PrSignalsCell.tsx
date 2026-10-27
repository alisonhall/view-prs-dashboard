import type { PrData } from '../../types/pr-data.ts';
import { describeChangeReasons } from '../../helpers/pr-needs-attention.helpers.ts';
import { EmptySignal, Signal, SignalGroup, type SignalProps } from '../ui/Signal';

/**
 * The Signals column: four fixed slots, so each lines up from row to row
 * and an empty slot reads as "no".
 * 1. Change: a dot when the PR changed since your last ack (its tooltip
 *    says what changed), a ring when it has had no recent activity,
 *    nothing for NO_CHANGE, and an info icon naming any other status (e.g.
 *    NO_LOCAL_DATA for a PR with stored notes but no local data), so no
 *    status goes unshown.
 * 2. Needs attention, with the reasons in its tooltip.
 * 3. Flagged.
 * 4. In review.
 *
 * The cell is one keyboard stop (SignalGroup): its focus tooltip lists
 * every signal; each icon also has its own tooltip on hover.
 */
export interface PrSignalsCellProps {
  pr: PrData;
  attentionReasons: string[];
  isFlagged: boolean;
  isInReview: boolean;
}

type SlotSignal = Omit<SignalProps, 'inGroup'> | null;

export function PrSignalsCell({ pr, attentionReasons, isFlagged, isInReview }: PrSignalsCellProps) {
  const status = String(pr?.status || '').trim().toUpperCase();
  const changed = status.startsWith('CHANGED');
  const noActivity = status === 'NO_ACTIVITY';
  const otherStatus = !changed && !noActivity && status && status !== '-' && status !== 'NO_CHANGE';

  const slots: SlotSignal[] = [
    changed
      ? { icon: 'dot', tone: 'accent', label: ['Changed since your last ack', ...describeChangeReasons(pr)].join('\n') }
      : noActivity
        ? { icon: 'ring', tone: 'muted', label: 'No recent activity' }
        : otherStatus
          ? { icon: 'info', tone: 'muted', label: `Status: ${status}` }
          : null,
    attentionReasons.length > 0
      ? { icon: 'alert', tone: 'attention', label: ['Needs attention', ...attentionReasons].join('\n') }
      : null,
    isFlagged ? { icon: 'flag', tone: 'danger', label: 'Flagged' } : null,
    isInReview ? { icon: 'eye', tone: 'accent', label: 'In review' } : null,
  ];

  return (
    <td className="pr-cell pr-cell-signals">
      <SignalGroup
        label="Signals"
        className="pr-signal-slots"
        summary={slots.flatMap((slot) => (slot ? [slot.label] : []))}
      >
        {/* Slots keep their position whether filled or not, so the index is a stable key. */}
        {slots.map((slot, index) => (slot ? <Signal key={index} {...slot} inGroup /> : <EmptySignal key={index} />))}
      </SignalGroup>
    </td>
  );
}
