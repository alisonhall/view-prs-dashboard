import { useState } from 'react';
import { Button } from '../ui/Button';

/**
 * Run & check's "Trigger auto run": starts the scheduler's next automatic
 * refresh now. Says "Triggering..." until the request finishes.
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
    <Button id="trigger-auto-run-btn" data-testid="trigger-auto-run-button" icon="pulse" disabled={busy} onClick={handleClick}>
      {busy ? 'Triggering...' : 'Trigger auto run'}
    </Button>
  );
}
