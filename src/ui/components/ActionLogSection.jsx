/**
 * ActionLogSection - React-owned content for the Management "Action Log"
 * tab's `#action-log-container`.
 *
 * Post-Phase-6 follow-up (see REACT_MIGRATION_PLAN.md): real JSX now,
 * replacing pr-action-log.helpers.js's renderActionLog/loadActionLog
 * (deleted). The tab-switch chrome (pr-management-tabs.helpers.js) and the
 * "Refresh" button (index.page.js) are unchanged and still vanilla - they
 * both still call a `loadActionLog` reference, which index.page.js now
 * points at `window.triggerActionLogLoad`, a bridge this component
 * registers on mount (the same "vanilla chrome still drives it, React owns
 * the content" shape as the container-split conversions elsewhere in this
 * codebase - only the *tab-switching* stays vanilla, not the data/render).
 *
 * @module components/ActionLogSection
 */

import React, { useEffect, useState } from 'react';

const formatIsoDatetime = (value) =>
  window.formatIsoDatetime ? window.formatIsoDatetime(value) : String(value || '-');

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
    return () => {
      delete window.triggerActionLogLoad;
    };
  }, []);

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
