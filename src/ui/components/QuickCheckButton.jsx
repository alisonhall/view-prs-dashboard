/**
 * QuickCheckButton - React-owned "Quick check" button (Run & Filter tab),
 * replacing index.page.js's own direct `btn.disabled`/`.textContent`
 * mutation around handleQuickCheck (deferred-items follow-up, full
 * vanilla-to-React sweep - see REACT_MIGRATION_PLAN.md).
 *
 * The fetch/branching business logic (POST /view-prs/quick-check, the
 * 409/503/failure/success cases, showing the error/warning snackbar) stays
 * in index.page.js's handleQuickCheck, injected here as the `onCheck`
 * callback - matching TriggerAutoRunButton.jsx's shape. Unlike that button,
 * this one's final label depends on the outcome (e.g. "3 updates found" vs
 * "No changes found" vs reverting immediately to "Quick check" on a
 * 409/503/failure) and a successful check's label reverts again after a
 * delay - so `onCheck` returns a `{ label, resetAfterMs? }` descriptor
 * instead of index.page.js mutating the DOM itself, and this component owns
 * the label/disabled state machine (including the delayed reset) around it.
 *
 * @module components/QuickCheckButton
 */

import { useEffect, useRef, useState } from 'react';

const DEFAULT_LABEL = 'Quick check';

export function QuickCheckButton({ onCheck }) {
  const [state, setState] = useState({ disabled: false, label: DEFAULT_LABEL });
  const resetTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(resetTimeoutRef.current), []);

  const handleClick = async () => {
    clearTimeout(resetTimeoutRef.current);
    setState({ disabled: true, label: 'Checking...' });
    try {
      const result = await onCheck?.();
      const label = result?.label || DEFAULT_LABEL;
      setState({ disabled: false, label });
      if (result?.resetAfterMs > 0) {
        resetTimeoutRef.current = setTimeout(() => {
          setState((previous) => ({ ...previous, label: DEFAULT_LABEL }));
        }, result.resetAfterMs);
      }
    } catch (_error) {
      setState({ disabled: false, label: DEFAULT_LABEL });
    }
  };

  return (
    <button
      type="button"
      id="quick-check-btn"
      title="Cheap listing-only pass: checks whether anything changed without fetching full PR details"
      disabled={state.disabled}
      onClick={handleClick}
    >
      {state.label}
    </button>
  );
}
