import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RepoBackgroundUpdatesMeta, RepoLiveSummaryMeta } from '../types/pr-data.ts';
import { DEFAULT_QUICK_CHECK_INTERVAL_MS } from '../helpers/pr-row-freshness.helpers.ts';

/**
 * Each repo's live summary state (the data meta's `liveSummary`: when its
 * open PRs were last listed, the last failure, its quick-check interval)
 * and background updates (`backgroundUpdates`: every repo checked in the
 * background, its interval, and whether it's paused), for the rows' freshness (pr-row-freshness.helpers.ts). A context so the
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
}

const DEFAULT_VALUE: RepoFreshnessValue = {
  liveSummary: {},
  backgroundUpdates: null,
  defaultIntervalMs: DEFAULT_QUICK_CHECK_INTERVAL_MS,
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
  children,
}: {
  liveSummary?: Record<string, RepoLiveSummaryMeta | undefined> | null;
  backgroundUpdates?: Record<string, RepoBackgroundUpdatesMeta | undefined> | null;
  defaultIntervalMs?: number;
  children?: ReactNode;
}) {
  // Keyed by content: each poll brings a new (equal) object.
  const key = JSON.stringify([liveSummary || {}, backgroundUpdates || null, defaultIntervalMs]);
  const value = useMemo<RepoFreshnessValue>(
    () => ({ liveSummary: liveSummary || {}, backgroundUpdates: backgroundUpdates || null, defaultIntervalMs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the content of all three
    [key],
  );
  return <RepoFreshnessContext.Provider value={value}>{children}</RepoFreshnessContext.Provider>;
}
