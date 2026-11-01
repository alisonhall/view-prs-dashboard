import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RepoLiveSummaryMeta } from '../types/pr-data.ts';
import { DEFAULT_QUICK_CHECK_INTERVAL_MS } from '../helpers/pr-row-freshness.helpers.ts';

/**
 * Each repo's live summary state (the data meta's `liveSummary`: when its
 * open PRs were last listed, the last failure, its quick-check interval),
 * for the rows' freshness (pr-row-freshness.helpers.ts). A context so the
 * memoized rows' cells reach it without a prop: they re-render when a
 * listing changes, not with every payload. The value only changes when the
 * listing state does.
 *
 * Unwrapped: no listings, the default interval.
 */
export interface RepoFreshnessValue {
  liveSummary: Record<string, RepoLiveSummaryMeta | undefined>;
  defaultIntervalMs: number;
}

const DEFAULT_VALUE: RepoFreshnessValue = { liveSummary: {}, defaultIntervalMs: DEFAULT_QUICK_CHECK_INTERVAL_MS };

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
  defaultIntervalMs = DEFAULT_QUICK_CHECK_INTERVAL_MS,
  children,
}: {
  liveSummary?: Record<string, RepoLiveSummaryMeta | undefined> | null;
  defaultIntervalMs?: number;
  children?: ReactNode;
}) {
  // Keyed by content: each poll brings a new (equal) object.
  const key = JSON.stringify([liveSummary || {}, defaultIntervalMs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the content of both
  const value = useMemo<RepoFreshnessValue>(() => ({ liveSummary: liveSummary || {}, defaultIntervalMs }), [key]);
  return <RepoFreshnessContext.Provider value={value}>{children}</RepoFreshnessContext.Provider>;
}
