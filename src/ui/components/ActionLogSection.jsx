/**
 * ActionLogSection - React-owned content for the Management "Action Log"
 * tab's `#action-log-container`.
 *
 * Post-Phase-6 follow-up (see REACT_MIGRATION_PLAN.md): real JSX now,
 * replacing pr-action-log.helpers.js's renderActionLog/loadActionLog
 * (deleted). The "Refresh" button (index.page.js) is unchanged and still
 * vanilla - it calls a `loadActionLog` reference, which index.page.js
 * points at `window.triggerActionLogLoad`, a bridge this component
 * registers on mount (the same "vanilla chrome still drives it, React owns
 * the content" shape as the container-split conversions elsewhere in this
 * codebase - only the *refresh button* stays vanilla, not the data/render).
 *
 * @module components/ActionLogSection
 *
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): this
 * component is now lazy-loaded (react-app.jsx), mounting only once the
 * Action Log tab is first activated.
 *
 * Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): re-triggering `load()` on every later re-activation (switch
 * away, then back) used to be `pr-management-tabs.helpers.js`'s
 * `activateTab("action-log")` calling `loadActionLog()` directly, outside
 * React entirely - that function is deleted outright this phase. Now owned
 * by this component's own second effect below, watching
 * `useIsTabPanelVisible('tab-panel-action-log')` - same shape
 * `useBackfillTabAutoRefresh.jsx` already established for the Backfill
 * tab, just inlined here since this is its only consumer.
 */

import { useEffect, useRef, useState } from 'react';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { useIsTabPanelVisible } from '../state/useIsTabPanelVisible';

const { formatIsoDatetime } = createPrFormattingHelpers();

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const buildDetailText = (entry) => {
  const parts = [];
  if (entry?.detail && typeof entry.detail === 'object') {
    Object.entries(entry.detail).forEach(([key, value]) => {
      if (value != null && value !== '') {
        parts.push(`${key}: ${value}`);
      }
    });
  }
  if (entry?.ok === false && entry?.error) {
    parts.push(`error: ${entry.error}`);
  }
  return parts.join(' · ');
};

export function ActionLogSection() {
  const [state, setState] = useState({ status: 'initial', entries: [], error: '' });
  const isVisible = useIsTabPanelVisible('tab-panel-action-log');

  useEffect(() => {
    const load = async () => {
      setState((previous) => ({ ...previous, status: 'loading' }));
      try {
        const response = await fetch('/view-prs/action-log');
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || 'Failed to load action log');
        }
        setState({
          status: 'loaded',
          entries: Array.isArray(result.entries) ? result.entries : [],
          error: '',
        });
      } catch (error) {
        setState({ status: 'error', entries: [], error: String(error?.message || error) });
      }
    };

    window.triggerActionLogLoad = load;
    load();
    return () => {
      delete window.triggerActionLogLoad;
    };
  }, []);

  // Phase H.22 (see this module's own header comment): re-trigger on every
  // later re-activation, matching activateTab("action-log")'s old
  // behavior exactly - skips this effect's own first run (the mount
  // effect above already loads unconditionally regardless of visibility,
  // same "eager load on mount" contract useBackfillTabAutoRefresh.jsx's
  // own comment describes) via a ref, not the `isVisible` value itself,
  // since on a first mount where the tab is already active this effect's
  // first run would otherwise double-fire right alongside the mount
  // effect's own load() call.
  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible) {
      window.triggerActionLogLoad?.();
    }
  }, [isVisible]);

  if (state.status === 'loading') {
    return <p className="action-log-empty">Loading...</p>;
  }

  if (state.status === 'error') {
    return <p className="action-log-empty">{`Failed to load action log: ${state.error}`}</p>;
  }

  if (state.entries.length === 0) {
    return <p className="action-log-empty">No actions logged yet.</p>;
  }

  return (
    <table className="action-log-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Action</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {state.entries.map((entry, index) => (
          <tr key={`${entry?.action || 'entry'}-${entry?.triggeredAt || index}`}>
            <td>{entry?.triggeredAt ? formatIsoDatetime(entry.triggeredAt) : '(unknown)'}</td>
            <td>
              <code>{String(entry?.action || '')}</code>
            </td>
            <td>
              {entry?.ok !== false ? (
                <span className="action-log-status-ok">OK</span>
              ) : (
                <span className="action-log-status-fail">Failed</span>
              )}
            </td>
            <td>{formatDuration(typeof entry?.durationMs === 'number' ? entry.durationMs : null)}</td>
            <td className="action-log-detail">{buildDetailText(entry)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
