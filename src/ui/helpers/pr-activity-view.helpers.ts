import type { FinishedJob, JobKey, JobState, ProgressTask } from "./pr-job-events.helpers.ts";
import type { ActiveRequestActivity, RecentRequestActivity } from "../state/RequestActivityContext";
import { formatShortAge } from "./pr-row-signals.helpers.ts";

// The activity popover's four lists (shell/ActivityPopover.tsx), from what
// the server pushes (JobEventsContext) and this tab's own requests:
// - Problems: what's stopping work, which you can fix or should know.
// - Now: everything running, whoever started it.
// - Up next: the dispatcher's queue in its order, and what's waiting.
// - Just finished: background jobs and your requests, newest first.

export const JOB_LABELS: Record<string, string> = {
  autoRefresh: "Full refresh",
  changedPrs: "Update changed PRs",
  quickCheck: "Quick check",
  mergedQueueDrain: "Merged/closed drain",
  mergedDrain: "Merged/closed drain",
  addPr: "Fetch added PR",
};

// What each kind of activity does, and what it doesn't update - each
// item's tooltip, and the popover's "What these are".
export interface ActivityKindGuide {
  kind: string;
  label: string;
  does: string;
  doesNotUpdate: string;
}

export const ACTIVITY_KIND_GUIDE: ActivityKindGuide[] = [
  {
    kind: "quickCheck",
    label: "Quick check",
    does:
      "Every 5 minutes per repo by default (Settings › Background updates): lists its PRs to spot new and changed ones, and queues them for an update. Its listing keeps open PRs' title, labels, draft state, checks, mergeability, files viewed, open conversations, size, assignees and requested reviewers current.",
    doesNotUpdate:
      "Comments, reviews and approvals, commits, what's said in conversations, and the diff - those wait for the update it queues. Nothing about merged and closed PRs beyond spotting that they changed.",
  },
  {
    kind: "changedPrs",
    label: "Update changed PRs",
    does:
      "Straight after a quick check finds PRs changed: fetches just those PRs in full - open, draft, merged and closed - then puts the full refresh back to its time. A repo with more than 25 queued gets a full refresh instead.",
    doesNotUpdate: "The repo's other PRs.",
  },
  {
    kind: "autoRefresh",
    label: "Full refresh",
    does:
      "Every 15 minutes per repo by default (Settings › Background updates), as a safety net: fetches the PRs that changed since their last fetch, and open ones not fetched in full for 4 hours.",
    doesNotUpdate:
      "PRs that look unchanged keep their stored details - what GitHub changes without marking a PR updated (checks finishing, mergeability, files viewed, conversations resolved) comes from the quick check's listing instead. A merged PR's diff is only ever fetched once.",
  },
  {
    kind: "mergedQueueDrain",
    label: "Merged/closed drain",
    does:
      "Every 30 minutes per repo by default (Settings › Background updates), or straight after a quick check: fetches the merged and closed PRs a quick check queued, in full. Does nothing when none are queued.",
    doesNotUpdate: "Open and draft PRs.",
  },
  {
    kind: "addPr",
    label: "Fetch added PR",
    does: "Straight after you add a PR by its URL (Add PR, in the header): fetches it in full, waiting first for a run of its repo already going.",
    doesNotUpdate: "Any other PR.",
  },
  {
    kind: "runScript",
    label: "Run script",
    does: "Started from Tools › Run & check: fetches a repo's PRs, or the ones you chose, in full - none reused from what's stored.",
    doesNotUpdate: "Other repos, or (for chosen PRs) the repo's other PRs.",
  },
  {
    kind: "olderMerged",
    label: "Fetch older merged PRs",
    does: "Started from Settings › Sources: fetches up to 30 of a repo's latest 100 merged PRs that aren't stored yet.",
    doesNotUpdate: "PRs already stored.",
  },
  {
    kind: "ackClear",
    label: "Ack/Clear",
    does: "Saves your Ack (or undoes it), then refreshes those PRs.",
    doesNotUpdate: "Other PRs.",
  },
];

// Its guide entry's text, for an item's tooltip ("" for a kind without one).
export const describeActivityKind = (kind: string | undefined): string => {
  const guide = ACTIVITY_KIND_GUIDE.find((entry) => entry.kind === (kind === "mergedDrain" ? "mergedQueueDrain" : kind));
  return guide ? `${guide.does} Doesn't update: ${guide.doesNotUpdate}` : "";
};

// The server's tasks someone started, by kind - the same keys as this
// tab's own requests (RequestActivityProvider), which they stand in for.
const REQUEST_TASK_LABELS: Record<string, string> = {
  runScript: "Run script",
  olderMerged: "Fetch older merged PRs",
  ackClear: "Ack/Clear",
};

// "12 of 30 PRs", "3 PRs so far", or nothing (one of one, none yet). Never
// more done than there are.
export const describeProgress = ({ done, total, unit }: Pick<ProgressTask, "done" | "total" | "unit">): string => {
  const plural = (count: number) => `${unit}${count === 1 ? "" : "s"}`;
  if (total !== null && total !== undefined) return total > 1 ? `${Math.min(done, total)} of ${total} ${plural(total)}` : "";
  return done > 0 ? `${done} ${plural(done)} so far` : "";
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
  // What kind of activity it is (ACTIVITY_KIND_GUIDE), for its tooltip.
  kind?: string;
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

// The requests of this tab the server's tasks don't already show (a task
// someone started stands in for the request of the same kind, with its
// progress - and shows in every tab).
const requestsNotInTasks = (activeRequests: ActiveRequestActivity[], tasks: ProgressTask[] | null) => {
  const taskKinds = new Set((tasks || []).filter((task) => task.origin === "you").map((task) => task.kind));
  return activeRequests.filter((request) => !taskKinds.has(request.key));
};

// What the Activity button counts: the tasks (or, from a server without
// them, the running jobs), and this tab's requests they don't show - not
// the page's own data load.
export const countActivity = ({
  jobs,
  tasks,
  activeRequests,
}: {
  jobs: Record<JobKey, JobState>;
  tasks: ProgressTask[] | null;
  activeRequests: ActiveRequestActivity[];
}): number =>
  (tasks ? tasks.length : Object.values(jobs).filter((job) => job.status === "running").length) +
  requestsNotInTasks(activeRequests, tasks).filter(countsAsActivity).length;

export const buildActivityNow = ({
  jobs,
  tasks = null,
  activeRequests,
  bulkBatches,
  isBackfillRunning,
  nowMs,
}: {
  jobs: Record<JobKey, JobState>;
  // The server's, with progress; null from a server without them (the
  // running jobs stand in).
  tasks?: ProgressTask[] | null;
  activeRequests: ActiveRequestActivity[];
  bulkBatches: BulkBatchSummary[];
  isBackfillRunning: boolean;
  nowMs: number;
}): ActivityNowItem[] => {
  const elapsedSince = (startMs: number) => (Number.isFinite(startMs) && startMs > 0 ? formatDuration(nowMs - startMs) : "");
  const severityOf = (runMs: number, request: ActiveRequestActivity | undefined): ActivityNowItem["severity"] =>
    !request ? "" : runMs >= request.thresholds.criticalMs ? "critical" : runMs >= request.thresholds.warnMs ? "warning" : "";
  const items: ActivityNowItem[] = [];
  if (tasks) {
    tasks.forEach((task) => {
      const startMs = parseMs(task.startedAt);
      // A request's thresholds, from this tab's own request of its kind.
      const request = task.origin === "you" ? activeRequests.find((candidate) => candidate.key === task.kind) : undefined;
      items.push({
        key: `task:${task.id}`,
        kind: task.kind,
        label: JOB_LABELS[task.kind] || REQUEST_TASK_LABELS[task.kind] || task.kind,
        detail: [describeRepos(asStrings(task.repos)), describeProgress(task)].filter(Boolean).join(" · "),
        origin: task.origin === "you" ? "you" : "background",
        elapsed: elapsedSince(startMs),
        severity: severityOf(Number.isFinite(startMs) ? nowMs - startMs : 0, request),
      });
    });
  } else {
    JOB_ORDER.forEach((key) => {
      const job = jobs[key];
      if (job?.status !== "running") return;
      // An auto refresh says which it is (a full refresh, or of changed PRs).
      const kind = typeof job.runningDetail?.kind === "string" ? job.runningDetail.kind : key;
      items.push({
        key: `job:${key}`,
        kind,
        label: JOB_LABELS[kind] || kind,
        detail: describeRepos(asStrings(job.runningDetail?.repos)),
        origin: "background",
        elapsed: elapsedSince(parseMs(job.startedAt)),
        severity: "",
      });
    });
  }
  requestsNotInTasks(activeRequests, tasks).forEach((request) => {
    const runMs = request.startedAtMs > 0 ? nowMs - request.startedAtMs : 0;
    if (!countsAsActivity(request) && runMs < SLOW_DATA_LOAD_MS) return;
    items.push({
      key: `request:${request.key}`,
      kind: request.key,
      label: request.label,
      detail: request.count > 1 ? `${request.count} at once` : "",
      origin: "you",
      elapsed: elapsedSince(request.startedAtMs),
      severity: severityOf(runMs, request),
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
  // An auto refresh due only for the PRs a quick check found changed.
  forChangedPrs?: boolean;
}

export interface ActivityUpNextItem {
  key: string;
  kind?: string;
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
      kind: "quickCheck",
      label: JOB_LABELS.quickCheck || "Quick check",
      // (Either kind of refresh of the repo.)
      detail: quickCheckWaitingOn === "autoRefresh" ? "waiting for a refresh of the repo to finish" : `waiting for the ${(JOB_LABELS[quickCheckWaitingOn] || quickCheckWaitingOn).toLowerCase()} to finish`,
      when: "next",
    });
  }
  (Array.isArray(dispatcherQueue) ? (dispatcherQueue as DispatcherEntry[]) : []).forEach((entry) => {
    // Running entries are under Now; paused ones under Problems.
    if (!entry || entry.status === "running" || entry.status === "circuit-open") return;
    const dueMs = parseMs(entry.nextDueAt);
    const isScheduled = entry.status === "scheduled" && Number.isFinite(dueMs) && dueMs > nowMs;
    const kind = entry.forChangedPrs ? "changedPrs" : entry.taskType;
    items.push({
      key: `dispatcher:${entry.repo}::${entry.taskType}`,
      kind,
      label: JOB_LABELS[kind] || entry.taskType,
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
      kind: "mergedQueueDrain",
      label: "Queued for the drain",
      detail: `${pendingOpenCount} open, ${pendingMergedClosedCount} merged/closed - changes a quick check found`,
      when: "",
    });
  }
  return items;
};

export interface ActivityFinishedItem {
  key: string;
  kind?: string;
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
      // The drain's refresh skipping: the drain's own skip says it.
      if (!skip || (key === "autoRefresh" && skip.kind === "mergedQueueDrain")) return [];
      const kind = skip.kind || key;
      return [
        {
          key: `skip:${key}:${skip.at}`,
          kind,
          label: JOB_LABELS[kind] || key,
          detail: `skipped: ${skip.reason || "unknown reason"}`,
          outcome: "skipped" as const,
          atMs: parseMs(skip.at),
        },
      ];
    }),
    ...(Array.isArray(recentFinished) ? recentFinished : [])
      // The drain once: its refresh's entry (labelled the drain's, by its
      // kind), which has the result and any error - the drain's own finish
      // has neither, and only comes when its refresh ran.
      .filter((entry) => entry.job !== "mergedQueueDrain")
      .map((entry, index) => {
        const kind = typeof entry.detail?.kind === "string" ? entry.detail.kind : entry.job;
        return {
          key: `job:${entry.job}:${entry.at}:${index}`,
          kind,
          label: JOB_LABELS[kind] || entry.job,
          detail: describeFinishedJob(entry),
          outcome: entry.ok === false ? ("failed" as const) : ("ok" as const),
          atMs: parseMs(entry.at),
        };
      }),
    ...(Array.isArray(recentRequestActivity) ? recentRequestActivity : [])
      .filter((entry) => !NOT_LISTED_AS_FINISHED.has(entry.key))
      .map((entry, index) => ({
        key: `request:${entry.key}:${entry.finishedAt}:${index}`,
        kind: entry.key,
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
