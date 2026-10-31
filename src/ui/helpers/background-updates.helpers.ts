// Settings › Background updates: each repo's background check settings,
// saved in user-defaults.json under SCHEDULER_REPO_CONFIG_KEY as
// { "owner/repo": { "priority": 2, "quickCheckIntervalMs": 120000 } } -
// only what's been changed from the defaults. The server's dispatcher
// (view-prs-dispatcher-helpers.js) reads it on every tick: an interval
// replaces that check's default; `priority` is added to every check's
// default priority.
export const SCHEDULER_REPO_CONFIG_KEY = 'schedulerRepoConfig';

export type TaskType = 'quickCheck' | 'autoRefresh' | 'mergedDrain';

// In the dispatcher's order, labelled as the Activity popover labels them.
export const TASK_TYPES: ReadonlyArray<{ taskType: TaskType; label: string }> = [
  { taskType: 'quickCheck', label: 'Quick check' },
  { taskType: 'autoRefresh', label: 'Auto refresh' },
  { taskType: 'mergedDrain', label: 'Merged/closed drain' },
];

export const intervalKey = (taskType: TaskType) => `${taskType}IntervalMs` as const;

export type RepoSchedulerSettings = Record<string, unknown> & {
  priority?: number;
  quickCheckIntervalMs?: number;
  autoRefreshIntervalMs?: number;
  mergedDrainIntervalMs?: number;
};
export type SchedulerRepoConfig = Record<string, RepoSchedulerSettings>;

// GET /view-prs/dispatcher/settings: the scheduled repos and each check's
// defaults.
export interface DispatcherSettingsDefaults {
  repos: string[];
  taskTypes: Array<{ taskType: TaskType; intervalMs: number; priority: number }>;
}

// Shorter than this, the checks would keep GitHub busy for little gain.
export const MIN_INTERVAL_MINUTES = 1;
export const MAX_PRIORITY_BOOST = 10;

// Repo objects only; a hand-edited file with stray values still reads.
export const normalizeSchedulerRepoConfig = (value: unknown): SchedulerRepoConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, settings]) => settings && typeof settings === 'object' && !Array.isArray(settings),
    ),
  ) as SchedulerRepoConfig;
};

// 120000 -> "2", 90000 -> "1.5" (minutes, as the form shows them).
export const formatMinutes = (ms: number) => String(Math.round((ms / 60000) * 100) / 100);

export type ParsedField = { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'error'; message: string };

export const parseMinutes = (text: string): ParsedField => {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes)) return { kind: 'error', message: 'Enter a number of minutes.' };
  if (minutes < MIN_INTERVAL_MINUTES) return { kind: 'error', message: `At least ${MIN_INTERVAL_MINUTES} minute.` };
  return { kind: 'value', value: Math.round(minutes * 60000) };
};

export const parsePriorityBoost = (text: string): ParsedField => {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  const boost = Number(trimmed);
  if (!Number.isInteger(boost) || Math.abs(boost) > MAX_PRIORITY_BOOST) {
    return { kind: 'error', message: `A whole number from -${MAX_PRIORITY_BOOST} to ${MAX_PRIORITY_BOOST}.` };
  }
  return { kind: 'value', value: boost };
};

// The config with one repo's setting changed (undefined removes it). A
// repo left with nothing is dropped, keeping the file to what's changed;
// any other keys a repo has are kept. A boost of 0 is the default too.
export const withRepoSetting = (
  config: SchedulerRepoConfig,
  repo: string,
  key: string,
  value: number | undefined,
): SchedulerRepoConfig => {
  const settings: RepoSchedulerSettings = { ...(config[repo] || {}) };
  if (value === undefined || (key === 'priority' && value === 0)) delete settings[key];
  else settings[key] = value;
  const next = { ...config };
  if (Object.keys(settings).length > 0) next[repo] = settings;
  else delete next[repo];
  return next;
};

export const withoutRepo = (config: SchedulerRepoConfig, repo: string): SchedulerRepoConfig => {
  const next = { ...config };
  delete next[repo];
  return next;
};

// The priorities a boost gives each check, for the form to show.
export const boostedPriorities = (defaults: DispatcherSettingsDefaults['taskTypes'], boost: number) =>
  defaults.map(({ taskType, priority }) => ({ taskType, priority: priority + boost }));
