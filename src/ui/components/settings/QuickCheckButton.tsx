import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

/**
 * Run & check's quick check buttons (useQuickCheckActions): a cheap check
 * for upstream changes. "Quick check" by default, beside Run script; the
 * Quick check group's "Quick check open and latest merged" and "Quick check
 * all" pass their own label, id and tooltip. Says "Checking..." while it
 * runs, then what it found for a few seconds when the result says to reset.
 */
export interface QuickCheckResult {
  label?: string;
  resetAfterMs?: number;
}

// Every quick check goes by GitHub's "updated at", so what doesn't change
// it goes unseen.
export const QUICK_CHECK_LIMITS =
  "Relies on GitHub's own \"updated at\" timestamp, so it won't catch a CI check finishing, " +
  'mergeability changing, or a review thread being resolved - those need a full refresh.';

export interface QuickCheckButtonProps {
  onCheck?: () => Promise<QuickCheckResult | undefined | void>;
  label?: string;
  id?: string;
  testId?: string;
  title?: string;
}

export function QuickCheckButton({
  onCheck,
  label: defaultLabel = 'Quick check',
  id = 'quick-check-btn',
  testId = 'quick-check-button',
  title = `Cheap listing-only pass: checks whether anything changed without fetching full PR details.\n${QUICK_CHECK_LIMITS}`,
}: QuickCheckButtonProps) {
  const [state, setState] = useState({ disabled: false, label: defaultLabel });
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimeoutRef.current), []);

  const handleClick = async () => {
    clearTimeout(resetTimeoutRef.current);
    setState({ disabled: true, label: 'Checking...' });
    try {
      const result = (await onCheck?.()) || undefined;
      setState({ disabled: false, label: result?.label || defaultLabel });
      if (result?.resetAfterMs && result.resetAfterMs > 0) {
        resetTimeoutRef.current = setTimeout(() => {
          setState((previous) => ({ ...previous, label: defaultLabel }));
        }, result.resetAfterMs);
      }
    } catch {
      setState({ disabled: false, label: defaultLabel });
    }
  };

  return (
    <Button id={id} data-testid={testId} title={title} disabled={state.disabled} onClick={handleClick}>
      {state.label}
    </Button>
  );
}
