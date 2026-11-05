import type { FinishedJob, JobKey, JobState } from "./pr-job-events.helpers.ts";
import type { ActiveRequestActivity, RecentRequestActivity } from "../state/RequestActivityContext";
import { formatShortAge } from "./pr-row-signals.helpers.ts";

// The activity popover's four lists (shell/ActivityPopover.tsx), from what
// the server pushes (JobEventsContext) and this tab's own requests:
// - Problems: what's stopping work, which you can fix or should know.
// - Now: everything running, whoever started it.
// - Up next: the dispatcher's queue in its order, and what's waiting.
// - Just finished: background jobs and your requests, newest first.

export const JOB_LABELS: Record<string, string> = {
  autoRefresh: "Auto refresh",
  quickCheck: "Quick check",
  mergedQueueDrain: "Merged/closed drain",
  mergedDrain: "Merged/closed drain",
};

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];

const parseMs = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

// "40s", "6m", "1h 5m".
export const formatDuration = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
};

// "acme/api", "acme/api, acme/web", or "3 repos".
const describeRepos = (repos: string[]): string => {
  if (repos.length === 0) return "";
  return repos.length <= 2 ? repos.join(", ") : `${repos.length} repos`;
};

const errorText = (error: unknown): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in (error as Record<string, unknown>)) {
    return String((error as { message?: unknown }).message || "");
  }
  return String(error);
};

export interface ActivityProblem {
  key: string;
  text: string;
  // The circuit breaker's: it can be reset from here.
  canReset?: boolean;
}

const CONNECTION_PROBLEMS: Record<string, string | undefined> = {
  reconnecting: "Live updates reconnecting…",
  offline: "Live updates disconnected - retrying…",
  unsupported: "Live updates aren't available in this browser.",
};

export const buildActivityProblems = ({
  openAutoCircuitRepos,
  connection,
  isStale,
  backfillStatusError,
}: {
  openAutoCircuitRepos: unknown[];
  connection: string;
  isStale: boolean;
  backfillStatusError: boolean;
}): ActivityProblem[] => {
  const problems: ActivityProblem[] = [];
  const pausedRepos = asStrings(openAutoCircuitRepos);
  if (pausedRepos.length > 0) {
    problems.push({
      key: "circuit",
      text: `Paused after repeated failures: ${pausedRepos.join(", ")}. Checks for ${pausedRepos.length === 1 ? "it" : "them"} wait out a cooldown, or reset now.`,
      canReset: true,
    });
  }
  const connectionProblem = CONNECTION_PROBLEMS[connection];
  if (connectionProblem) problems.push({ key: "connection", text: connectionProblem });
  else if (connection === "open" && isStale) {
    problems.push({ key: "connection", text: "Live updates may be stale - nothing received for a while." });
  }
  if (backfillStatusError) problems.push({ key: "backfill", text: "Backfill status couldn't be read." });
  return problems;
};

export interface ActivityNowItem {
  key: string;
  label: string;
  // What it's working on, or how far it's got.
  detail: string;
  // Who started it.
  origin: "background" | "you";
  elapsed: string;
  // Running long enough to warn, or to look stuck.
  severity: "" | "warning" | "critical";
}

export interface BulkBatchSummary {
  batchId: string;
  actionLabel?: string;
  totalChunks: number;
  doneCount: number;
  failedCount: number;
}

const JOB_ORDER: JobKey[] = ["autoRefresh", "quickCheck", "mergedQueueDrain"];

// The page's own data load runs on every poll: it isn't counted on the
// Activity button, and shows under Now only once it's slow.
const DATA_LOAD_KEY = "dataLoad";
export const SLOW_DATA_LOAD_MS = 5000;
export const countsAsActivity = (request: ActiveRequestActivity): boolean => request.key !== DATA_LOAD_KEY;

export const buildActivityNow = ({
  jobs,
  activeRequests,
  bulkBatches,
  isBackfillRunning,
  nowMs,
}: {
  jobs: Record<JobKey, JobState>;
  activeRequests: ActiveRequestActivity[];
  bulkBatches: BulkBatchSummary[];
  isBackfillRunning: boolean;
  nowMs: number;
}): ActivityNowItem[] => {
  const elapsedSince = (startMs: number) => (Number.isFinite(startMs) && startMs > 0 ? formatDuration(nowMs - startMs) : "");
  const items: ActivityNowItem[] = [];
  JOB_ORDER.forEach((key) => {
    const job = jobs[key];
    if (job?.status !== "running") return;
    items.push({
      key: `job:${key}`,
      label: JOB_LABELS[key] || key,
      detail: describeRepos(asStrings(job.runningDetail?.repos)),
      origin: "background",
      elapsed: elapsedSince(parseMs(job.startedAt)),
      severity: "",
    });
  });
  activeRequests.forEach((request) => {
    const runMs = request.startedAtMs > 0 ? nowMs - request.startedAtMs : 0;
    if (!countsAsActivity(request) && runMs < SLOW_DATA_LOAD_MS) return;
    items.push({
      key: `request:${request.key}`,
      label: request.label,
      detail: request.count > 1 ? `${request.count} at once` : "",
      origin: "you",
      elapsed: elapsedSince(request.startedAtMs),
      severity: runMs >= request.thresholds.criticalMs ? "critical" : runMs >= request.thresholds.warnMs ? "warning" : "",
    });
  });
  bulkBatches.forEach((batch) => {
    const resolved = batch.doneCount + batch.failedCount;
    if (resolved >= batch.totalChunks) return;
    items.push({
      key: `batch:${batch.batchId}`,
      label: batch.actionLabel || "Bulk action",
      detail: `chunk ${Math.min(resolved + 1, batch.totalChunks)} of ${batch.totalChunks}${batch.failedCount > 0 ? `, ${batch.failedCount} failed` : ""}`,
      origin: "you",
      elapsed: "",
      severity: batch.failedCount > 0 ? "warning" : "",
    });
  });
  if (isBackfillRunning) {
    items.push({ key: "backfill", label: "Backfill", detail: "", origin: "background", elapsed: "", severity: "" });
  }
  return items;
};

// One dispatcher queue entry (getDispatcherQueueSnapshot,
// view-prs-dispatcher-helpers.js), per (repo, task type), in its order.
export interface DispatcherEntry {
  repo: string;
  taskType: string;
  status: string;
  priority?: number;
  nextDueAt?: string | null;
}

export interface ActivityUpNextItem {
  key: string;
  label: string;
  detail: string;
  when: string;
  // A scheduled entry, which "Run now" can bring forward.
  repo?: string;
  taskType?: string;
  canRunNow?: boolean;
  priority?: number;
}

export const buildActivityUpNext = ({
  dispatcherQueue,
  quickCheckWaitingOn,
  pendingOpenCount,
  pendingMergedClosedCount,
  nowMs,
}: {
  dispatcherQueue: unknown[];
  quickCheckWaitingOn: string | null;
  pendingOpenCount: number;
  pendingMergedClosedCount: number;
  nowMs: number;
}): ActivityUpNextItem[] => {
  const items: ActivityUpNextItem[] = [];
  if (quickCheckWaitingOn) {
    items.push({
      key: "quick-check-waiting",
      label: JOB_LABELS.quickCheck || "Quick check",
      detail: `waiting for the ${(JOB_LABELS[quickCheckWaitingOn] || quickCheckWaitingOn).toLowerCase()} to finish`,
      when: "next",
    });
  }
  (Array.isArray(dispatcherQueue) ? (dispatcherQueue as DispatcherEntry[]) : []).forEach((entry) => {
    // Running entries are under Now; paused ones under Problems.
    if (!entry || entry.status === "running" || entry.status === "circuit-open") return;
    const dueMs = parseMs(entry.nextDueAt);
    const isScheduled = entry.status === "scheduled" && Number.isFinite(dueMs) && dueMs > nowMs;
    items.push({
      key: `dispatcher:${entry.repo}::${entry.taskType}`,
      label: JOB_LABELS[entry.taskType] || entry.taskType,
      detail: entry.repo,
      when: isScheduled ? `in ${formatDuration(dueMs - nowMs)}` : "due now",
      repo: entry.repo,
      taskType: entry.taskType,
      canRunNow: entry.status === "scheduled",
      priority: entry.priority,
    });
  });
  if (pendingOpenCount > 0 || pendingMergedClosedCount > 0) {
    items.push({
      key: "drain-queued",
      label: "Queued for the drain",
      detail: `${pendingOpenCount} open, ${pendingMergedClosedCount} merged/closed - changes a quick check found`,
      when: "",
    });
  }
  return items;
};

export interface ActivityFinishedItem {
  key: string;
  label: string;
  detail: string;
  // A job's result, or a run it skipped (with why); your requests don't
  // report one (each shows its own error when it fails).
  outcome: "ok" | "failed" | "skipped" | "done";
  ago: string;
  atMs: number;
}

export const FINISHED_LIMIT = 8;

// The page's own data loads (every poll) would crowd out the rest.
const NOT_LISTED_AS_FINISHED = new Set([DATA_LOAD_KEY]);

const describeFinishedJob = (entry: FinishedJob): string => {
  const detail = entry.detail || {};
  const error = entry.ok === false ? errorText(detail.error) : "";
  if (error) return error;
  const repos = asStrings(detail.repos);
  if (repos.length > 0) return describeRepos(repos);
  const checked = Number(detail.reposCheckedCount);
  return Number.isFinite(checked) && checked > 0 ? `${checked} repo${checked === 1 ? "" : "s"}` : "";
};

const formatAgo = (ms: number, nowMs: number): string => {
  const age = formatShortAge(new Date(ms).toISOString(), nowMs);
  return age === "now" ? "just now" : age ? `${age} ago` : "";
};

export const buildActivityFinished = ({
  recentFinished,
  recentRequestActivity,
  jobs,
  nowMs,
}: {
  recentFinished: FinishedJob[];
  recentRequestActivity: RecentRequestActivity[];
  // Each job's last skipped run, with why ("Last skip").
  jobs?: Partial<Record<JobKey, JobState>>;
  nowMs: number;
}): ActivityFinishedItem[] =>
  [
    ...JOB_ORDER.flatMap((key) => {
      const skip = jobs?.[key]?.lastSkip;
      return skip
        ? [{ key: `skip:${key}:${skip.at}`, label: JOB_LABELS[key] || key, detail: `skipped: ${skip.reason || "unknown reason"}`, outcome: "skipped" as const, atMs: parseMs(skip.at) }]
        : [];
    }),
    ...(Array.isArray(recentFinished) ? recentFinished : []).map((entry, index) => ({
      key: `job:${entry.job}:${entry.at}:${index}`,
      label: JOB_LABELS[entry.job] || entry.job,
      detail: describeFinishedJob(entry),
      outcome: entry.ok === false ? ("failed" as const) : ("ok" as const),
      atMs: parseMs(entry.at),
    })),
    ...(Array.isArray(recentRequestActivity) ? recentRequestActivity : [])
      .filter((entry) => !NOT_LISTED_AS_FINISHED.has(entry.key))
      .map((entry, index) => ({
      key: `request:${entry.key}:${entry.finishedAt}:${index}`,
      label: entry.label,
      detail: "",
      outcome: "done" as const,
      atMs: parseMs(entry.finishedAt),
    })),
  ]
    .filter((item) => Number.isFinite(item.atMs))
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, FINISHED_LIMIT)
    .map((item) => ({ ...item, ago: formatAgo(item.atMs, nowMs) }));
