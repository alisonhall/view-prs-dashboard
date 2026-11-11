import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RepoBackgroundUpdatesMeta, RepoLiveSummaryMeta } from '../types/pr-data.ts';
import { DEFAULT_QUICK_CHECK_INTERVAL_MS, type RepoRefreshFailure } from '../helpers/pr-row-freshness.helpers.ts';

/**
 * Each repo's live summary state (the data meta's `liveSummary`: when its
 * open PRs were last listed, the last failure, its quick-check interval)
 * and background updates (`backgroundUpdates`: every repo checked in the
 * background, its interval, and whether it's paused), and what couldn't be
 * refreshed (the scheduler state's `refreshFailures` and `unreachablePrs`),
 * for the rows' freshness (pr-row-freshness.helpers.ts). A context so the
 * memoized rows' cells reach it without a prop: they re-render when a
 * listing changes, not with every payload. The value only changes when the
 * listing state does.
 *
 * Unwrapped: no listings, the default interval, background updates unknown.
 */
export interface RepoFreshnessValue {
  liveSummary: Record<string, RepoLiveSummaryMeta | undefined>;
  // null when the server doesn't send them (see backgroundUpdatesFor).
  backgroundUpdates: Record<string, RepoBackgroundUpdatesMeta | undefined> | null;
  defaultIntervalMs: number;
  // Each repo's last refresh that failed, until one works.
  refreshFailures: Record<string, RepoRefreshFailure>;
  // "repo#number" => since when it couldn't be fetched.
  unreachablePrs: Record<string, string>;
}

const DEFAULT_VALUE: RepoFreshnessValue = {
  liveSummary: {},
  backgroundUpdates: null,
  defaultIntervalMs: DEFAULT_QUICK_CHECK_INTERVAL_MS,
  refreshFailures: {},
  unreachablePrs: {},
};

export const RepoFreshnessContext = createContext<RepoFreshnessValue>(DEFAULT_VALUE);

export function useRepoFreshness(): RepoFreshnessValue {
  return useContext(RepoFreshnessContext);
}

// The scheduler's default quick-check interval, in ms, from its public
// state (`quickCheckIntervalMinutes`).
export const readDefaultQuickCheckIntervalMs = (scheduler: unknown): number => {
  const minutes = Number((scheduler as { quickCheckIntervalMinutes?: unknown } | null | undefined)?.quickCheckIntervalMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : DEFAULT_QUICK_CHECK_INTERVAL_MS;
};

export function RepoFreshnessProvider({
  liveSummary,
  backgroundUpdates,
  defaultIntervalMs = DEFAULT_QUICK_CHECK_INTERVAL_MS,
  refreshFailures,
  unreachablePrs,
  children,
}: {
  liveSummary?: Record<string, RepoLiveSummaryMeta | undefined> | null;
  backgroundUpdates?: Record<string, RepoBackgroundUpdatesMeta | undefined> | null;
  defaultIntervalMs?: number;
  refreshFailures?: Record<string, RepoRefreshFailure> | null;
  unreachablePrs?: Record<string, string> | null;
  children?: ReactNode;
}) {
  // Keyed by content: each poll brings a new (equal) object.
  const key = JSON.stringify([liveSummary || {}, backgroundUpdates || null, defaultIntervalMs, refreshFailures || {}, unreachablePrs || {}]);
  const value = useMemo<RepoFreshnessValue>(
    () => ({
      liveSummary: liveSummary || {},
      backgroundUpdates: backgroundUpdates || null,
      defaultIntervalMs,
      refreshFailures: refreshFailures || {},
      unreachablePrs: unreachablePrs || {},
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the content of all five
    [key],
  );
  return <RepoFreshnessContext.Provider value={value}>{children}</RepoFreshnessContext.Provider>;
}
