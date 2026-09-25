/**
 * TriggerAutoRunButton - React-owned "Trigger auto run" button (Activity
 * tab), replacing index.page.js's own direct `btn.disabled`/`.textContent`
 * mutation around handleTriggerAutoRun (deferred-items follow-up, full
 * vanilla-to-React sweep - see REACT_MIGRATION_PLAN.md).
 *
 * The fetch/branching business logic (POST /view-prs/run-auto, showing the
 * error/failure snackbar) stays in index.page.js's handleTriggerAutoRun,
 * injected here as the `onTrigger` callback - this component owns only the
 * disabled/label state machine around that call, matching PrTableApp's
 * onCheckboxChange/onAckAction callback-prop pattern. Always resets to the
 * same label once the call settles (success or failure), so no result
 * descriptor is needed - contrast with QuickCheckButton.jsx, whose final
 * label depends on the outcome.
 *
 * @module components/TriggerAutoRunButton
 */

import { useState } from 'react';

const DEFAULT_LABEL = 'Trigger auto run';

export function TriggerAutoRunButton({ onTrigger }) {
  const [state, setState] = useState({ disabled: false, label: DEFAULT_LABEL });

  const handleClick = async () => {
    setState({ disabled: true, label: 'Triggering...' });
    try {
      await onTrigger?.();
    } finally {
      setState({ disabled: false, label: DEFAULT_LABEL });
    }
  };

  return (
    <button type="button" id="trigger-auto-run-btn" disabled={state.disabled} onClick={handleClick}>
      {state.label}
    </button>
  );
}
