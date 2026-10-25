import type { PrData } from '../../types/pr-data.ts';
import { describeChecks, describeMergeable } from '../../helpers/pr-row-signals.helpers.ts';
import { EmptySignal, Signal, SignalGroup } from '../ui/Signal';

/**
 * The CHK·MRG column: checks and mergeability, each in a fixed slot (empty
 * when there are no checks or no data), as one keyboard stop. See
 * pr-row-signals.helpers.ts for the states and their tooltips.
 */
export function PrChecksCell({ pr }: { pr: PrData }) {
  const checks = describeChecks(pr);
  const mergeable = describeMergeable(pr);
  return (
    <td className="pr-cell pr-cell-checks">
      <SignalGroup
        label="Checks and mergeability"
        className="pr-signal-slots"
        summary={[checks?.label, mergeable?.label].filter((line): line is string => Boolean(line))}
      >
        {checks ? <Signal icon={checks.icon} tone={checks.tone} label={checks.label} inGroup /> : <EmptySignal />}
        {mergeable ? <Signal icon={mergeable.icon} tone={mergeable.tone} label={mergeable.label} inGroup /> : <EmptySignal />}
      </SignalGroup>
    </td>
  );
}
