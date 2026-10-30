import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

/**
 * Run & check's "Quick check": a cheap check of the PRs listed for
 * upstream changes (useQuickCheckActions). Says "Checking..." while it
 * runs, then what it found for a few seconds when the result says to reset.
 */
export interface QuickCheckResult {
  label?: string;
  resetAfterMs?: number;
}

const DEFAULT_LABEL = 'Quick check';

export function QuickCheckButton({ onCheck }: { onCheck?: () => Promise<QuickCheckResult | undefined | void> }) {
  const [state, setState] = useState({ disabled: false, label: DEFAULT_LABEL });
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimeoutRef.current), []);

  const handleClick = async () => {
    clearTimeout(resetTimeoutRef.current);
    setState({ disabled: true, label: 'Checking...' });
    try {
      const result = (await onCheck?.()) || undefined;
      setState({ disabled: false, label: result?.label || DEFAULT_LABEL });
      if (result?.resetAfterMs && result.resetAfterMs > 0) {
        resetTimeoutRef.current = setTimeout(() => {
          setState((previous) => ({ ...previous, label: DEFAULT_LABEL }));
        }, result.resetAfterMs);
      }
    } catch {
      setState({ disabled: false, label: DEFAULT_LABEL });
    }
  };

  return (
    <Button
      id="quick-check-btn"
      data-testid="quick-check-button"
      title={
        'Cheap listing-only pass: checks whether anything changed without fetching full PR details.\n' +
        "Relies on GitHub's own \"updated at\" timestamp, so it won't catch a CI check finishing, " +
        'mergeability changing, or a review thread being resolved - those need a full refresh.'
      }
      disabled={state.disabled}
      onClick={handleClick}
    >
      {state.label}
    </Button>
  );
}
