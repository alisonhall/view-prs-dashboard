import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

/**
 * The app header's refresh: "Quick check all" checks every loaded PR, in
 * every repo, for upstream changes (useQuickCheckActions). Says
 * "Checking..." while it runs, then what it found (e.g. "2 updates found")
 * for a few seconds when the result says to reset.
 */
export interface QuickCheckAllResult {
  label?: string;
  resetAfterMs?: number;
}

export interface QuickCheckAllButtonProps {
  onCheck?: () => Promise<QuickCheckAllResult | undefined | void>;
}

const DEFAULT_LABEL = 'Quick check all';

export function QuickCheckAllButton({ onCheck }: QuickCheckAllButtonProps) {
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
      id="quick-check-all-btn"
      icon="refresh"
      title={
        'Checks every PR row already loaded, across every repo, for changes.\n' +
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
