import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import {
  describeActionLog,
  filterActionLogRows,
  findActionLogRow,
  listActionLogFilterOptions,
  EMPTY_ACTION_LOG_FILTERS,
  type ActionLogEntry,
  type ActionLogFilters,
} from '../../helpers/action-log-view.helpers.ts';
import { describeActivityKind } from '../../helpers/pr-activity-view.helpers.ts';
import { useIsSettingsSectionVisible, useSettingsDrawer } from '../../state/SettingsDrawerContext';

const { formatIsoDatetime } = createPrFormattingHelpers();

type ActionLogState =
  | { status: 'initial' | 'loading' | 'loaded'; entries: ActionLogEntry[]; error: '' }
  | { status: 'error'; entries: ActionLogEntry[]; error: string };

const formatDuration = (ms: number | null) => {
  if (typeof ms !== 'number') return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const OUTCOME_TEXT = { ok: 'OK', failed: 'Failed', skipped: 'Skipped' } as const;

/**
 * The Tools drawer's "Action log" (UI_REDESIGN_PLAN.md, phase 9b): the
 * server's log, newest first - what you did (runs, acks, backfills...)
 * and the background runs (quick checks, refreshes, the drain, and the
 * skips that kept one from happening). One line each - when, what, who,
 * how it went, its repos - with the rest folded under it; filtered by
 * kind, outcome, who and repo. Activity's Just finished opens it at an
 * entry (actionLogFocus), clearing the filters that would hide it.
 *
 * Lazy-loaded, mounting the first time the section is opened. It loads on
 * mount, then again each time the section comes back into view (the first
 * run of that effect is skipped: the mount load covers it).
 */
export function ActionLogSection() {
  const [state, setState] = useState<ActionLogState>({ status: 'initial', entries: [], error: '' });
  const [filters, setFilters] = useState<ActionLogFilters>(EMPTY_ACTION_LOG_FILTERS);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Asked for an entry the log doesn't have.
  const [isFocusMissing, setIsFocusMissing] = useState(false);
  // When the last load began - an entry asked for after it may not be in it.
  const [loadStartedAt, setLoadStartedAt] = useState(0);
  const isVisible = useIsSettingsSectionVisible('action-log');
  const { actionLogFocus } = useSettingsDrawer();
  const focusedRef = useRef<HTMLLIElement | null>(null);

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setIsFocusMissing(false);
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
      setLoadStartedAt(startedAt);
    } catch (error) {
      setState({ status: 'error', entries: [], error: String((error as Error)?.message || error) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Also when it's asked for an entry while showing - one load either way.
  const focusRequestedAt = actionLogFocus?.requestedAt ?? 0;
  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible) {
      load();
    }
  }, [isVisible, focusRequestedAt, load]);

  const rows = useMemo(() => describeActionLog(state.entries), [state.entries]);
  const options = useMemo(() => listActionLogFilterOptions(rows), [rows]);
  const shown = filterActionLogRows(rows, filters);

  // Once a load after the request has the entry: shown, unfiltered, open.
  const handledFocusRef = useRef<number | null>(null);
  useEffect(() => {
    if (!actionLogFocus || handledFocusRef.current === actionLogFocus.requestedAt) return;
    if (state.status !== 'loaded' || loadStartedAt < actionLogFocus.requestedAt) return;
    handledFocusRef.current = actionLogFocus.requestedAt;
    const row = findActionLogRow(rows, actionLogFocus);
    setFocusedId(row?.id ?? null);
    setIsFocusMissing(!row);
    if (row) setFilters(EMPTY_ACTION_LOG_FILTERS);
  }, [actionLogFocus, rows, state.status, loadStartedAt]);
  useEffect(() => {
    focusedRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedId]);

  const setFilter = <K extends keyof ActionLogFilters>(key: K, value: ActionLogFilters[K]) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const isFiltered = Object.values(filters).some(Boolean);

  let content;
  if (state.status === 'error') {
    content = <p className="action-log-empty">{`Failed to load action log: ${state.error}`}</p>;
  } else if (rows.length === 0) {
    content = <p className="action-log-empty">{state.status === 'loaded' ? 'No actions logged yet.' : 'Loading...'}</p>;
  } else if (shown.length === 0) {
    content = <p className="action-log-empty">Nothing logged matches these filters.</p>;
  } else {
    content = (
      <ol className="action-log-list" aria-label="Action log entries">
        {shown.map((row) => {
          const isFocused = row.id === focusedId;
          return (
            <li
              key={row.id}
              ref={isFocused ? focusedRef : undefined}
              className="action-log-entry"
              data-outcome={row.outcome}
              data-focused={isFocused || undefined}
            >
              <details open={isFocused || undefined}>
                <summary>
                  <span className="action-log-when">{Number.isFinite(row.atMs) ? formatIsoDatetime(new Date(row.atMs).toISOString()) : '(unknown)'}</span>
                  <span className="action-log-label" title={describeActivityKind(row.kind) || undefined}>
                    {row.label}
                  </span>
                  <span className="action-log-origin" data-origin={row.origin}>
                    {row.origin === 'you' ? 'You' : 'Background'}
                  </span>
                  <span className={`action-log-status action-log-status-${row.outcome}`}>{OUTCOME_TEXT[row.outcome]}</span>
                  {row.repos.length > 0 && (
                    <span className="action-log-repos">{row.repos.length <= 2 ? row.repos.join(', ') : `${row.repos.length} repos`}</span>
                  )}
                  {row.summary && <span className="action-log-summary">{row.summary}</span>}
                  {row.durationMs !== null && <span className="action-log-duration">{formatDuration(row.durationMs)}</span>}
                </summary>
                <dl className="action-log-details">
                  {row.repos.length > 2 && (
                    <div>
                      <dt>repos</dt>
                      <dd>{row.repos.join(', ')}</dd>
                    </div>
                  )}
                  {row.details.map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="settings-hint">
          What you did, and what the server did in the background - each quick check, full refresh, update and drain - newest
          first. Open an entry for its details.
        </p>
        <div className="settings-actions action-log-filters">
          <Button icon="refresh" disabled={state.status === 'loading'} onClick={() => load()}>
            {state.status === 'loading' && rows.length > 0 ? 'Loading...' : 'Refresh'}
          </Button>
          <span className="action-log-filter">
            <label htmlFor="action-log-filter-kind">Kind</label>
            <select className="settings-control" id="action-log-filter-kind" value={filters.kind} onChange={(event) => setFilter('kind', event.target.value)}>
              <option value="">All</option>
              {options.kinds.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </span>
          <span className="action-log-filter">
            <label htmlFor="action-log-filter-outcome">Outcome</label>
            <select className="settings-control" id="action-log-filter-outcome" value={filters.outcome} onChange={(event) => setFilter('outcome', event.target.value as ActionLogFilters['outcome'])}>
              <option value="">All</option>
              <option value="problems">Failed or skipped</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
              <option value="ok">OK</option>
            </select>
          </span>
          <span className="action-log-filter">
            <label htmlFor="action-log-filter-origin">Who</label>
            <select className="settings-control" id="action-log-filter-origin" value={filters.origin} onChange={(event) => setFilter('origin', event.target.value as ActionLogFilters['origin'])}>
              <option value="">Everyone</option>
              <option value="you">You</option>
              <option value="background">Background</option>
            </select>
          </span>
          <span className="action-log-filter">
            <label htmlFor="action-log-filter-repo">Repo</label>
            <select className="settings-control" id="action-log-filter-repo" value={filters.repo} onChange={(event) => setFilter('repo', event.target.value)}>
              <option value="">All</option>
              {options.repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </span>
          {isFiltered && (
            <Button onClick={() => setFilters(EMPTY_ACTION_LOG_FILTERS)}>Clear filters</Button>
          )}
        </div>
        {isFocusMissing && (
          <p className="subtle-copy" role="status">
            That one isn't in the log - runs with nothing to do aren't logged.
          </p>
        )}
        {rows.length > 0 && (
          <p className="subtle-copy">{isFiltered ? `Showing ${shown.length} of ${rows.length}` : `${rows.length} logged`}</p>
        )}
        <div id="action-log-container" className="action-log-container">
          {content}
        </div>
      </div>
    </div>
  );
}
