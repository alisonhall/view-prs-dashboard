import { useEffect, useRef, useState } from 'react';
import { useJobEvents } from '../state/JobEventsContext';

/**
 * Activity drawer feature: the per-repo auto-refresh circuit breaker's
 * current state (see autoCircuitByRepo in app.js) - a repo's auto refresh
 * and quick check both stop entirely for a while after repeated failures
 * (e.g. expired gh auth, or the computer was asleep/locked). Renders
 * nothing when no repo's circuit is open (same "don't fabricate empty
 * state" convention as ActivityDrawerDispatcherSection); when one or more
 * is open, lists the affected repo(s) and offers a manual "Reset circuit
 * breaker" action that clears every open repo's breaker at once, via the
 * `onReset` prop (wired from index.page.js's handleResetCircuitBreaker
 * through ActivityDrawer.jsx, same shape as the dispatcher section's
 * onBump).
 */
export function ActivityDrawerCircuitBreakerSection({ onReset }) {
  const { openAutoCircuitRepos } = useJobEvents();
  const repos = Array.isArray(openAutoCircuitRepos) ? openAutoCircuitRepos : [];
  const [isResetting, setIsResetting] = useState(false);
  // Guards against a state update after this section unmounts (e.g. the
  // drawer is closed mid-request) - same pattern as
  // ActivityDrawerDispatcherSection's own handleBumpClick.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (repos.length === 0) {
    return null;
  }

  const handleResetClick = async () => {
    setIsResetting(true);
    try {
      await onReset?.();
    } finally {
      if (isMountedRef.current) {
        setIsResetting(false);
      }
    }
  };

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Circuit breaker</h3>
      <p className="activity-drawer-section-caption">
        Auto refresh stops for a repo after repeated failures (e.g. expired gh auth, or the
        computer was asleep/locked) - reset to try again immediately instead of waiting out the
        cooldown.
      </p>
      <ul className="activity-drawer-circuit-breaker-repos">
        {repos.map((repo) => (
          <li key={repo} className="activity-drawer-circuit-breaker-repo">
            {repo}
          </li>
        ))}
      </ul>
      {typeof onReset === 'function' && (
        <button
          type="button"
          className="activity-drawer-circuit-breaker-reset"
          disabled={isResetting}
          onClick={handleResetClick}
        >
          {isResetting ? 'Resetting…' : 'Reset circuit breaker'}
        </button>
      )}
    </section>
  );
}
