import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import { useIsSettingsSectionVisible } from '../../state/SettingsDrawerContext';

const { formatIsoDatetime } = createPrFormattingHelpers();

interface ActionLogEntry {
  action?: string;
  triggeredAt?: string;
  ok?: boolean;
  error?: string;
  durationMs?: number;
  detail?: Record<string, unknown> | null;
}

type ActionLogState =
  | { status: 'initial' | 'loading' | 'loaded'; entries: ActionLogEntry[]; error: '' }
  | { status: 'error'; entries: ActionLogEntry[]; error: string };

const formatDuration = (ms: number | null) => {
  if (typeof ms !== 'number') return '-';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const buildDetailText = (entry: ActionLogEntry) => {
  const parts: string[] = [];
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

/**
 * The Settings drawer's "Action log" (UI_REDESIGN_PLAN.md, phase 9b): the
 * server's log of actions (runs, acks, backfills...) with their status,
 * duration and detail, and a Refresh button.
 *
 * Lazy-loaded, mounting the first time the section is opened. It loads on
 * mount, then again each time the section comes back into view (the first
 * run of that effect is skipped: the mount load covers it).
 */
export function ActionLogSection() {
  const [state, setState] = useState<ActionLogState>({ status: 'initial', entries: [], error: '' });
  const isVisible = useIsSettingsSectionVisible('action-log');

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: '' }));
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
      setState({ status: 'error', entries: [], error: String((error as Error)?.message || error) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible) {
      load();
    }
  }, [isVisible, load]);

  let content;
  if (state.status === 'loading') {
    content = <p className="action-log-empty">Loading...</p>;
  } else if (state.status === 'error') {
    content = <p className="action-log-empty">{`Failed to load action log: ${state.error}`}</p>;
  } else if (state.entries.length === 0) {
    content = <p className="action-log-empty">No actions logged yet.</p>;
  } else {
    content = (
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

  return (
    <div className="settings-section">
      <div className="settings-group">
        <div className="settings-actions">
          <Button icon="refresh" onClick={() => load()}>
            Refresh
          </Button>
        </div>
        <div id="action-log-container" className="action-log-container">
          {content}
        </div>
      </div>
    </div>
  );
}
