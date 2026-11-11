import { JOB_LABELS } from './pr-activity-view.helpers.ts';

// One entry of the server's action log (scheduler-helpers.js), newest
// first: an action you started (its route's), or a background run's.
export interface ActionLogEntry {
  action?: string;
  // An activity kind (Activity's): a background run's, or a full refresh's.
  kind?: string;
  origin?: 'you' | 'background';
  triggeredAt?: string;
  // When it was written - as it ended.
  timestamp?: string;
  ok?: boolean | null;
  skipped?: boolean;
  error?: string;
  durationMs?: number;
  detail?: Record<string, unknown> | null;
}

export type ActionLogOutcome = 'ok' | 'failed' | 'skipped';

export interface ActionLogRow {
  id: string;
  kind: string;
  label: string;
  origin: 'you' | 'background';
  repos: string[];
  outcome: ActionLogOutcome;
  // When it started (or was written, when that's all it says).
  atMs: number;
  // When it was written.
  loggedAtMs: number;
  durationMs: number | null;
  // One line: why it failed or skipped (its outcome says which), or what
  // it did.
  summary: string;
  // The rest, folded.
  details: Array<[string, string]>;
}

// Each route's entries, by the same names as Activity's (the tab's
// requests' keys, RequestActivityProvider) - so a Just finished item finds
// its entry.
const ACTIONS: Record<string, { kind: string; label: string; origin: 'you' | 'background' }> = {
  'post/run': { kind: 'runScript', label: 'Run script', origin: 'you' },
  'post/run-auto': { kind: 'runAuto', label: 'Full refresh now', origin: 'you' },
  'post/quick-check': { kind: 'quickCheck', label: 'Quick check', origin: 'you' },
  'post/ack': { kind: 'ackClear', label: 'Ack/Clear', origin: 'you' },
  'post/merged/request-more': { kind: 'olderMerged', label: 'Fetch older merged PRs', origin: 'you' },
  'post/labels/apply': { kind: 'labelApply', label: 'Apply label', origin: 'you' },
  'post/notes': { kind: 'notesSave', label: 'Notes save', origin: 'you' },
  'post/thread-checks': { kind: 'threadCheck', label: 'Conversation check', origin: 'you' },
  'post/author-comments': { kind: 'authorComment', label: 'Author comment', origin: 'you' },
  'put/author-comments': { kind: 'authorComment', label: 'Author comment', origin: 'you' },
  'get/backfill': { kind: 'backfill', label: 'Backfill', origin: 'you' },
  'post/backfill/:action': { kind: 'backfill', label: 'Backfill', origin: 'you' },
  'server/start': { kind: 'server', label: 'Server started', origin: 'background' },
  'server/shutdown': { kind: 'server', label: 'Server stopped', origin: 'background' },
};

const parseMs = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const asRepos = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list.map((repo) => String(repo ?? '').trim()).filter((repo) => repo.includes('/'));
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const describeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(describeValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// What a run did, in one line, for the kinds that say.
const describeResult = (kind: string, detail: Record<string, unknown>): string => {
  const count = (key: string) => (typeof detail[key] === 'number' ? (detail[key] as number) : null);
  if (kind === 'quickCheck') {
    const checked = count('reposCheckedCount') ?? (Array.isArray(detail.reposChecked) ? detail.reposChecked.length : null);
    const parts = [
      checked !== null ? `${plural(checked, 'repo')} checked` : '',
      count('reposFailedCount') ? `${count('reposFailedCount')} failed` : '',
      count('newPendingOpenCount') ? `${count('newPendingOpenCount')} open changed` : '',
      count('newPendingMergedClosedCount') ? `${count('newPendingMergedClosedCount')} merged/closed changed` : '',
    ];
    return parts.filter(Boolean).join(' · ');
  }
  if (count('successCount') !== null || count('failureCount') !== null) {
    return [count('successCount') ? `${plural(count('successCount') as number, 'repo')} refreshed` : '', count('failureCount') ? `${count('failureCount')} failed` : '']
      .filter(Boolean)
      .join(' · ');
  }
  return '';
};

// `index` is its place in the log, newest first; the id doesn't use it, so
// it stays the same when newer entries arrive (see actionLogRowIds).
export const describeActionLogEntry = (entry: ActionLogEntry, index: number): ActionLogRow => {
  const action = String(entry?.action || '');
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const known = ACTIONS[action];
  // A background run's (job/<job>) and a full refresh's say their kind.
  const isRun = action === 'auto-refresh' || action.startsWith('job/');
  const kind = isRun ? entry.kind || (action === 'auto-refresh' ? 'autoRefresh' : action.slice(4)) : known?.kind || action || 'unknown';
  const label = isRun ? JOB_LABELS[kind] || kind : known?.label || action || '(unknown)';
  const origin = entry?.origin === 'you' || entry?.origin === 'background' ? entry.origin : isRun ? 'background' : known?.origin || 'you';
  const outcome: ActionLogOutcome = entry?.skipped ? 'skipped' : entry?.ok === false ? 'failed' : 'ok';
  const loggedAtMs = parseMs(entry?.timestamp);
  const startedMs = parseMs(entry?.triggeredAt);
  const reason = typeof detail.reason === 'string' ? detail.reason : '';
  const message = typeof detail.message === 'string' ? detail.message : '';
  const summary =
    outcome === 'failed'
      ? entry?.error || 'Failed'
      : outcome === 'skipped'
        ? message || reason || 'Unknown reason'
        : describeResult(kind, detail);
  const details: Array<[string, string]> = [
    ['action', action],
    ...Object.entries(detail)
      .map(([key, value]): [string, string] => [key, describeValue(value)])
      .filter(([, value]) => value !== ''),
    ...(entry?.error && outcome !== 'failed' ? [['error', entry.error] as [string, string]] : []),
  ];
  return {
    id: `${entry?.timestamp || entry?.triggeredAt || `#${index}`}|${action}`,
    kind,
    label,
    origin,
    repos: [...new Set([...asRepos(detail.repos), ...asRepos(detail.repo), ...asRepos(detail.reposChecked)])],
    outcome,
    atMs: Number.isFinite(startedMs) ? startedMs : loggedAtMs,
    loggedAtMs: Number.isFinite(loggedAtMs) ? loggedAtMs : startedMs,
    durationMs: typeof entry?.durationMs === 'number' ? entry.durationMs : null,
    summary,
    details,
  };
};

// The rows, each with an id of its own: its time and action, and for two
// alike, which of them counting from the oldest - so an entry keeps its id
// (its folding, its highlight) when a reload brings newer ones.
export const describeActionLog = (entries: ActionLogEntry[]): ActionLogRow[] => {
  const rows = entries.map(describeActionLogEntry);
  const seen = new Map<string, number>();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] as ActionLogRow;
    const count = seen.get(row.id) || 0;
    seen.set(row.id, count + 1);
    if (count > 0) row.id = `${row.id}|${count}`;
  }
  return rows;
};

export interface ActionLogFilters {
  kind: string;
  outcome: '' | ActionLogOutcome | 'problems';
  origin: '' | 'you' | 'background';
  repo: string;
}

export const EMPTY_ACTION_LOG_FILTERS: ActionLogFilters = { kind: '', outcome: '', origin: '', repo: '' };

export const filterActionLogRows = (rows: ActionLogRow[], filters: ActionLogFilters): ActionLogRow[] =>
  rows.filter(
    (row) =>
      (!filters.kind || row.kind === filters.kind) &&
      (!filters.outcome || (filters.outcome === 'problems' ? row.outcome !== 'ok' : row.outcome === filters.outcome)) &&
      (!filters.origin || row.origin === filters.origin) &&
      (!filters.repo || row.repos.includes(filters.repo)),
  );

// The kinds (by label) and repos the log has, for its filters.
export const listActionLogFilterOptions = (rows: ActionLogRow[]) => ({
  kinds: [...new Map(rows.map((row) => [row.kind, row.label])).entries()]
    .map(([kind, label]) => ({ kind, label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
  repos: [...new Set(rows.flatMap((row) => row.repos))].sort(),
});

// How far an entry's time may be from a Just finished item's: the item's
// is when the page heard it ended, the entry's when the server wrote it.
const FOCUS_WINDOW_MS = 60_000;

// Activity's names for requests the log has under another: a Single PR
// update is a run of the script (POST /view-prs/run).
const LOGGED_AS: Record<string, string> = { singlePr: 'runScript' };

// The entry a Just finished item is: of its kind, written nearest its time.
export const findActionLogRow = (rows: ActionLogRow[], focus: { kind: string; atMs: number }): ActionLogRow | null => {
  const kind = LOGGED_AS[focus.kind] || focus.kind;
  let best: ActionLogRow | null = null;
  rows.forEach((row) => {
    if (row.kind !== kind || !Number.isFinite(row.loggedAtMs)) return;
    const distance = Math.abs(row.loggedAtMs - focus.atMs);
    if (distance <= FOCUS_WINDOW_MS && (!best || distance < Math.abs(best.loggedAtMs - focus.atMs))) best = row;
  });
  return best;
};
