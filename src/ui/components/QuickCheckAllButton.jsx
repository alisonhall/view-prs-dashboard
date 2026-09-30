/**
 * QuickCheckAllButton - "Quick check all" button (Run & Filter tab), a
 * sibling of QuickCheckButton.jsx rather than a parametrized variant of it -
 * same precedent as TriggerAutoRunButton.jsx being its own component instead
 * of a generic parametrized button. Checks every PR row already loaded in
 * the app (across every repo represented in the loaded rows), instead of
 * requiring PR numbers to be typed into the Run & Filter tab's field.
 *
 * The fetch/branching business logic (POST /view-prs/quick-check-all, the
 * 409/503/failure/success cases) stays in index.page.js's handleQuickCheckAll,
 * injected here as the `onCheck` callback - same shape as QuickCheckButton.jsx,
 * including the delayed label reset after a successful check.
 *
 * @module components/QuickCheckAllButton
 */

import { useEffect, useRef, useState } from 'react';

const DEFAULT_LABEL = 'Quick check all';

export function QuickCheckAllButton({ onCheck }) {
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
      id="quick-check-all-btn"
      title="Checks every PR row already loaded, across every repo, for changes"
      disabled={state.disabled}
      onClick={handleClick}
    >
      {state.label}
    </button>
  );
}
