import type { PrEntry, RepoBackgroundUpdatesMeta, RepoLiveSummaryMeta } from "../types/pr-data.ts";
import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";

// How current a row is (ROADMAP.md, Data freshness step 5). An open/draft
// row has two ages:
// - its summary - what the collapsed row shows (title, labels, size, CI,
//   mergeability, viewed files, conversations) - confirmed by its repo's
//   latest live summary (the server's listing with each quick check), or
//   by the last run that refreshed it: a full fetch, or a full run reusing
//   it (which takes the listing's title, labels and size, and fetches its
//   CI - `ciFetchedAt`, and the run's stamp `updatedAt`);
// - its details - reviews, approvals, activity - from its last full fetch
//   (`fetchedAt`).
// It's stale when its summary hasn't been confirmed for about two of its
// repo's quick-check intervals, or its repo's listing is failing. A repo
// with no background updates (not in the data meta's `backgroundUpdates`)
// isn't expected to be checked, so its rows say so rather than go stale; a
// repo whose background updates are paused (its circuit breaker) says that
// too. Merged and closed rows only change when GitHub says they did, so
// they're never stale.

const { formatIsoDatetime } = createPrFormattingHelpers();

// Without a repo's own interval (the data meta's), the server's default.
export const DEFAULT_QUICK_CHECK_INTERVAL_MS = 5 * 60 * 1000;
// Room for a check that's running, or waited behind a full refresh.
const STALE_GRACE_MS = 60 * 1000;

const toMs = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return Number.NaN;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.NaN;
};

// The later of two timestamps; an unparseable one never wins.
const laterOf = (a: string, b: string): string => {
  if (!Number.isFinite(toMs(b))) return a;
  return !Number.isFinite(toMs(a)) || toMs(b) > toMs(a) ? b : a;
};

// "just now", "5m ago", "3h ago", "2d ago"; "" when unknown.
export const formatAgo = (value: unknown, nowMs: number): string => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.floor(Math.max(0, nowMs - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const describeAt = (value: unknown, nowMs: number) => {
  const ago = formatAgo(value, nowMs);
  return ago ? `${ago} (${formatIsoDatetime(String(value))})` : "unknown";
};

export interface RepoListing {
  checkedAt: string;
  // The last listing failed (it keeps the one before).
  isFailing: boolean;
  lastError: string;
  // Not listed for about two intervals, or failing.
  isStale: boolean;
  // false when the repo has no background updates: nothing checks it, so
  // it isn't stale for that.
  isScheduled: boolean;
  // Its background updates are paused until pausedUntil (its circuit
  // breaker, after repeated failures).
  isPaused: boolean;
  pausedUntil: string;
  // How long before a confirmation counts as stale.
  staleAfterMs: number;
}

// A repo's entry in the data meta's `backgroundUpdates`: undefined when the
// server doesn't send them (older ones), null when the repo isn't checked
// in the background.
export const backgroundUpdatesFor = (
  backgroundUpdates: Record<string, RepoBackgroundUpdatesMeta | undefined> | null | undefined,
  repo: string,
): RepoBackgroundUpdatesMeta | null | undefined => (backgroundUpdates ? (backgroundUpdates[repo] ?? null) : undefined);

export const describeRepoListing = (
  meta: RepoLiveSummaryMeta | null | undefined,
  {
    nowMs,
    defaultIntervalMs = DEFAULT_QUICK_CHECK_INTERVAL_MS,
    background,
  }: { nowMs: number; defaultIntervalMs?: number; background?: RepoBackgroundUpdatesMeta | null },
): RepoListing => {
  // The repo's background updates when the server sends them; otherwise
  // the listing's own interval (older servers).
  const configuredIntervalMs =
    background !== undefined ? (background?.quickCheckIntervalMs ?? null) : meta?.quickCheckIntervalMs;
  const intervalMs =
    Number.isFinite(configuredIntervalMs) && Number(configuredIntervalMs) > 0
      ? Number(configuredIntervalMs)
      : defaultIntervalMs;
  const staleAfterMs = 2 * intervalMs + STALE_GRACE_MS;
  const checkedAt = String(meta?.checkedAt || "");
  const checkedMs = toMs(checkedAt);
  const errorMs = toMs(meta?.lastErrorAt);
  const isFailing = Number.isFinite(errorMs) && (!Number.isFinite(checkedMs) || errorMs >= checkedMs);
  const isOld = !Number.isFinite(checkedMs) || nowMs - checkedMs > staleAfterMs;
  // Only an explicit null: older data meta without the field is scheduled.
  const isScheduled = configuredIntervalMs !== null;
  const pausedUntil = String(background?.pausedUntil || "");
  const isPaused = isScheduled && toMs(pausedUntil) > nowMs;
  return {
    checkedAt,
    isFailing,
    lastError: isFailing ? String(meta?.lastError || "") : "",
    isStale: isScheduled && (isFailing || isOld),
    staleAfterMs,
    isScheduled,
    isPaused,
    pausedUntil: isPaused ? pausedUntil : "",
  };
};

export interface RowFreshness {
  // When the row's summary was last confirmed, and its details fetched.
  summaryConfirmedAt: string;
  detailsFetchedAt: string;
  // The details are behind GitHub: it has newer activity, or the quick
  // check queued the PR for update. The summary values are current.
  detailsBehind: boolean;
  // A complete listing no longer has it: merged or closed since.
  noLongerOpen: boolean;
  isStale: boolean;
  // For tooltips, one line each.
  lines: string[];
}

export const describeRowFreshness = ({
  entry,
  listing,
  nowMs,
}: {
  entry: PrEntry | null | undefined;
  listing: RepoListing | null | undefined;
  nowMs: number;
}): RowFreshness => {
  const data = entry?.data || {};
  const section = String(entry?.section || "");
  const isOpen = section === "open" || section === "draft";
  const detailsFetchedAt = String(entry?.fetchedAt || entry?.updatedAt || "");
  const isListed = isOpen && data.live?.stillOpen === true && Boolean(listing?.checkedAt);
  // The latest of what refreshed the summary. The run's stamp only for rows
  // from before `ciFetchedAt`: a run that reused a row but couldn't fetch
  // its CI still moves the stamp, not `ciFetchedAt`.
  const summaryConfirmedAt = [
    isListed ? String(listing?.checkedAt) : "",
    String(entry?.ciFetchedAt || ""),
    String(entry?.fetchedAt || ""),
    entry?.ciFetchedAt ? "" : String(entry?.updatedAt || ""),
  ].reduce(laterOf, "");
  const noLongerOpen = isOpen && data.live?.stillOpen === false;
  const detailsBehind =
    isOpen && (data.live?.detailsBehind === true || data.updatePending === true || noLongerOpen);

  const confirmedMs = toMs(summaryConfirmedAt);
  const staleAfterMs = listing?.staleAfterMs ?? 2 * DEFAULT_QUICK_CHECK_INTERVAL_MS + STALE_GRACE_MS;
  const isUnscheduled = listing?.isScheduled === false;
  const isStale =
    isOpen &&
    !isUnscheduled &&
    (Boolean(listing?.isFailing) || !Number.isFinite(confirmedMs) || nowMs - confirmedMs > staleAfterMs);

  const lines: string[] = [];
  if (isOpen) {
    lines.push(`Summary confirmed ${describeAt(summaryConfirmedAt, nowMs)}.`);
  }
  lines.push(`Details fetched ${describeAt(detailsFetchedAt, nowMs)}.`);
  if (noLongerOpen) {
    lines.push("No longer open on GitHub (merged or closed); its update is queued.");
  } else if (detailsBehind) {
    lines.push("GitHub has newer activity; reviews, approvals and activity update when its queued refresh runs.");
  }
  if (isOpen && isUnscheduled) {
    lines.push("Not checked automatically: its repo has no background updates.");
  } else if (isOpen && listing?.isPaused) {
    lines.push(
      `${isStale ? "Stale: b" : "B"}ackground updates for its repo are paused until ${formatIsoDatetime(listing.pausedUntil)}, after repeated failures.`,
    );
  } else if (isOpen && listing?.isFailing) {
    lines.push(`Stale: checking its repo is failing${listing.lastError ? ` (${listing.lastError})` : ""}.`);
  } else if (isStale) {
    lines.push("Stale: not confirmed recently.");
  }

  return { summaryConfirmedAt, detailsFetchedAt, detailsBehind, noLongerOpen, isStale, lines };
};

// A repo's last refresh that failed, until one works (the scheduler
// state's `refreshFailures`): when, since when its refreshes have been
// failing, why, and for a refresh of chosen PRs which (null: the repo's).
export interface RepoRefreshFailure {
  at?: string;
  since?: string;
  error?: string;
  prNumbers?: string[] | null;
}

export interface RowRefreshProblem {
  // "Couldn't refresh", or "Couldn't fetch" (it may be gone).
  label: string;
  // How old its data is: "2h ago".
  dataAge: string;
  // For its tooltip, one line each.
  lines: string[];
}

// How long an open row's full fetch lasts before a refresh of its repo
// fetches it again unchanged: the script's VIEW_PRS_OPEN_REVALIDATE_SECONDS,
// by default (the page isn't told when it's set otherwise).
const OPEN_REVALIDATE_MS = 4 * 60 * 60 * 1000;

// Whether the row's last refresh failed, so it shows what was stored: a PR
// fetched on its own that couldn't be fetched (deleted, or no longer
// visible to gh), or a row not fetched since its repo's refresh failed -
// one of the PRs a refresh of chosen PRs failed on, or for a refresh of
// the repo an open or draft row it would have fetched: one queued for an
// update (changed on GitHub), or whose full fetch was older than
// OPEN_REVALIDATE_MS when it failed. Other rows it would have left as they
// were, so its failing doesn't make them out of date. Null when it's fine.
export const describeRowRefreshProblem = ({
  entry,
  refreshFailures,
  unreachablePrs,
  nowMs,
}: {
  entry: PrEntry | null | undefined;
  refreshFailures: Record<string, RepoRefreshFailure | undefined> | null | undefined;
  unreachablePrs: Record<string, string | undefined> | null | undefined;
  nowMs: number;
}): RowRefreshProblem | null => {
  const repo = String(entry?.repo || "");
  const number = String(entry?.prNumber || entry?.data?.number || "");
  const fetchedAt = String(entry?.fetchedAt || entry?.updatedAt || "");
  const dataAge = formatAgo(fetchedAt, nowMs);
  const showing = `Showing the data from ${describeAt(fetchedAt, nowMs)}.`;
  const unreachableSince = unreachablePrs?.[`${repo}#${number}`];
  if (unreachableSince) {
    return {
      label: "Couldn't fetch",
      dataAge,
      lines: [`Couldn't fetch it since ${describeAt(unreachableSince, nowMs)}: deleted, or no longer visible to gh.`, showing],
    };
  }
  const failure = refreshFailures?.[repo];
  if (!failure) return null;
  const section = String(entry?.section || "");
  const data = entry?.data || {};
  const isChosen = Array.isArray(failure.prNumbers);
  const wouldHaveFetched =
    (section === "open" || section === "draft") &&
    (data.updatePending === true ||
      data.live?.detailsBehind === true ||
      data.live?.stillOpen === false ||
      !(toMs(failure.at) - toMs(fetchedAt) < OPEN_REVALIDATE_MS));
  const applies = isChosen ? (failure.prNumbers || []).map(String).includes(number) : wouldHaveFetched;
  // Fetched since (by a run that worked, or Retry).
  if (!applies || toMs(fetchedAt) >= toMs(failure.at)) return null;
  const failingSince = toMs(failure.since) < toMs(failure.at) ? `Its refreshes have failed since ${describeAt(failure.since, nowMs)}.` : "";
  return {
    label: "Couldn't refresh",
    dataAge,
    lines: [
      `Couldn't refresh: ${isChosen ? "its" : "its repo's"} last refresh failed ${describeAt(failure.at, nowMs)}${failure.error ? ` (${failure.error})` : ""}.`,
      failingSince,
      showing,
    ].filter(Boolean),
  };
};

export interface ReposChecked {
  // "Checked 3m ago" (the least recently checked repo), or "" when no repo
  // has been listed.
  label: string;
  // One line per repo, plus the last run.
  title: string;
  isStale: boolean;
}

// The header's freshness: how long since the repos shown were checked.
export const describeReposChecked = ({
  repos,
  liveSummary,
  backgroundUpdates,
  defaultIntervalMs,
  lastRunAt,
  nowMs,
}: {
  repos: string[];
  liveSummary: Record<string, RepoLiveSummaryMeta | undefined> | null | undefined;
  backgroundUpdates?: Record<string, RepoBackgroundUpdatesMeta | undefined> | null;
  defaultIntervalMs?: number;
  lastRunAt?: unknown;
  nowMs: number;
}): ReposChecked => {
  const listed = repos.filter((repo) => liveSummary?.[repo]).map((repo) => ({
    repo,
    listing: describeRepoListing(liveSummary?.[repo], {
      nowMs,
      defaultIntervalMs,
      background: backgroundUpdatesFor(backgroundUpdates, repo),
    }),
  }));
  const lastRunLine = formatAgo(lastRunAt, nowMs) ? `Last run ${describeAt(lastRunAt, nowMs)}.` : "";
  if (listed.length === 0) {
    return { label: "", title: lastRunLine, isStale: false };
  }
  // The label is about the repos checked in the background; a repo that
  // isn't (an old listing left from when it was) only when none are.
  const scheduled = listed.filter(({ listing }) => listing.isScheduled);
  const oldest = (scheduled.length > 0 ? scheduled : listed).reduce((a, b) =>
    toMs(b.listing.checkedAt) < toMs(a.listing.checkedAt) ? b : a,
  );
  const oldestAgo = formatAgo(oldest.listing.checkedAt, nowMs);
  const lines = listed.map(({ repo, listing }) => {
    const checked = listing.checkedAt ? `checked ${describeAt(listing.checkedAt, nowMs)}` : "not checked yet";
    if (!listing.isScheduled) return `${repo}: ${checked}; not checked automatically`;
    if (listing.isPaused) return `${repo}: ${checked}; paused until ${formatIsoDatetime(listing.pausedUntil)}, after repeated failures`;
    if (listing.isFailing) return `${repo}: ${checked}; failing${listing.lastError ? ` (${listing.lastError})` : ""}`;
    return `${repo}: ${checked}${listing.isStale ? " (stale)" : ""}`;
  });
  return {
    label: oldestAgo ? `Checked ${oldestAgo}` : "Not checked yet",
    title: [...lines, lastRunLine].filter(Boolean).join("\n"),
    isStale: listed.some(({ listing }) => listing.isStale),
  };
};
