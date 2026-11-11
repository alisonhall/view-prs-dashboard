import { useState } from 'react';
import { Button } from '../ui/Button';

/**
 * Run & check's "Full refresh now": starts the background full refresh of
 * every followed repo now (POST /view-prs/run-auto), instead of at its
 * time. Says "Starting..." until the request finishes.
 */
export function TriggerAutoRunButton({ onTrigger }: { onTrigger?: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    setBusy(true);
    try {
      await onTrigger?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      id="trigger-auto-run-btn"
      data-testid="trigger-auto-run-button"
      icon="pulse"
      title="Starts the background full refresh of every followed repo now, instead of at its time: it fetches the PRs that changed since their last fetch, and open ones not fetched in full for 4 hours."
      disabled={busy}
      onClick={handleClick}
    >
      {busy ? 'Starting...' : 'Full refresh now'}
    </Button>
  );
}
