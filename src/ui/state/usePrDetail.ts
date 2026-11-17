import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFetchWithTimeout } from '../helpers/fetch-with-timeout.helpers.ts';
import { buildPrEntryKey } from '../helpers/pr-entry-keys.helpers.ts';
import type { PrData, PrDataPayload, PrEntry } from '../types/pr-data.ts';

// The list's rows carry their detail fields without the text (comment
// bodies, commit messages, links; the timeline empty - PrData.detailSlim):
// the text was most of the ~100 MB a full load sent for 960 PRs. Where one
// PR is shown in full - the detail pane, the expanded row's summary, the PR
// JSON window - usePrDetail fetches the rest (/view-prs/pr-detail), and the
// export fetches it for the PRs it takes (fetchPrDetailsInto).

export type PrDetailFields = Pick<PrData, 'activityTimeline' | 'activityEvents' | 'reviewThreads' | 'commentEvents'>;

interface CachedDetail {
  // The row's detailVersion the detail was fetched for: a row whose
  // version moves (its detail changed) fetches again.
  forVersion: string;
  detail: PrDetailFields;
}

// The last few PRs' detail, so stepping back and forth through PRs doesn't
// fetch each one again - and no more, as the page held every PR's before.
export const PR_DETAIL_CACHE_LIMIT = 12;
const cache = new Map<string, CachedDetail>();

const remember = (key: string, value: CachedDetail) => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > PR_DETAIL_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const cachedDetail = (key: string, version: string): PrDetailFields | null => {
  const cached = cache.get(key);
  return cached && cached.forVersion === version ? cached.detail : null;
};

// For tests.
export const clearPrDetailCache = () => cache.clear();

const fetchWithTimeout = createFetchWithTimeout((input, init) => fetch(input, init));

const asDetail = (value: unknown): PrDetailFields => {
  const detail = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const list = <T>(field: unknown) => (Array.isArray(field) ? (field as T[]) : []);
  return {
    activityTimeline: list(detail.activityTimeline),
    activityEvents: list(detail.activityEvents),
    reviewThreads: list(detail.reviewThreads),
    commentEvents: list(detail.commentEvents),
  };
};

const withDetail = (pr: PrData, detail: PrDetailFields): PrData => ({ ...pr, ...detail, detailSlim: false });

export interface PrDetailState {
  // The row with its full detail once fetched; the slim row until then
  // (everything but the text is already there).
  pr: PrData;
  loading: boolean;
  failed: boolean;
  // Fetches again after a failure.
  retry: () => void;
}

export function usePrDetail(pr: PrData, repo: string, prNumber: string): PrDetailState {
  const key = buildPrEntryKey(repo, prNumber);
  const isSlim = pr?.detailSlim === true;
  const version = String(pr?.detailVersion || '');
  // The last detail fetched for this PR, and the version it was for.
  const [state, setState] = useState<{ key: string; forVersion: string; detail: PrDetailFields | null; failed: boolean }>(() => ({
    key,
    forVersion: version,
    detail: null,
    failed: false,
  }));
  const [attempt, setAttempt] = useState(0);
  const cached = isSlim ? cachedDetail(key, version) : null;
  const ownState = state.key === key;
  const isCurrent = ownState && state.forVersion === version;
  // This version's detail; else, while it's fetched, the version before's
  // - so the text doesn't blink out each time the PR shown changes.
  const shown = cached || (ownState ? state.detail : null);
  const failed = isSlim && !cached && isCurrent && state.failed;

  useEffect(() => {
    if (!isSlim || !repo || !prNumber || cachedDetail(key, version)) return undefined;
    let cancelled = false;
    setState((previous) => (previous.key === key ? { ...previous, failed: false } : { key, forVersion: version, detail: null, failed: false }));
    const query = new URLSearchParams({ repo, prNumber }).toString();
    fetchWithTimeout(`/view-prs/pr-detail?${query}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result?.ok === false) throw new Error(result?.error || `HTTP ${response.status}`);
        const detail = asDetail(result.detail);
        remember(key, { forVersion: version, detail });
        if (!cancelled) setState({ key, forVersion: version, detail, failed: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState((previous) => ({ key, forVersion: version, detail: previous.key === key ? previous.detail : null, failed: true }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSlim, key, version, repo, prNumber, attempt]);

  const merged = useMemo(() => (isSlim && shown ? withDetail(pr, shown) : pr), [isSlim, shown, pr]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const fresh = Boolean(cached) || (isCurrent && Boolean(state.detail));
  return { pr: merged, loading: isSlim && !fresh && !failed, failed, retry };
}

// A copy of the payload whose rows for these keys ("owner/repo#123") have
// their full detail, fetched in one request (the export). Rows that aren't
// slim are left as they are.
export async function fetchPrDetailsInto(
  payload: PrDataPayload | null | undefined,
  keys: readonly string[],
  fetchImpl: typeof fetch = fetchWithTimeout,
): Promise<PrDataPayload> {
  const byPrNumber = payload?.byPrNumber || {};
  const wanted = keys
    .map((key) => ({ key, entry: byPrNumber[key] as PrEntry | undefined }))
    .filter(({ entry }) => entry?.data?.detailSlim === true);
  if (!wanted.length) return payload || {};
  const prs = wanted.map(({ key, entry }) => ({
    repo: String(entry?.repo || key.slice(0, key.lastIndexOf('#'))),
    prNumber: String(entry?.prNumber || entry?.data?.number || key.split('#').pop() || ''),
  }));
  const response = await fetchImpl('/view-prs/pr-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prs }),
  });
  const result = await response.json();
  if (!response.ok || result?.ok === false) throw new Error(result?.error || `Couldn't fetch the PRs' detail (HTTP ${response.status})`);
  const fetched = (result?.byPrKey || {}) as Record<string, { detail?: unknown }>;
  const nextByPrNumber = { ...byPrNumber };
  wanted.forEach(({ key, entry }, index) => {
    const found = fetched[buildPrEntryKey(prs[index]?.repo, prs[index]?.prNumber)];
    if (!found || !entry) return;
    nextByPrNumber[key] = { ...entry, data: withDetail(entry.data || {}, asDetail(found.detail)) };
  });
  return { ...(payload || {}), byPrNumber: nextByPrNumber };
}
