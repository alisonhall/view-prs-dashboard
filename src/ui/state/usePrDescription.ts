import { useCallback, useEffect, useState } from 'react';
import { createFetchWithTimeout } from '../helpers/fetch-with-timeout.helpers.ts';
import { buildPrEntryKey } from '../helpers/pr-entry-keys.helpers.ts';

// A PR's description for the detail pane's Description tab, from
// /view-prs/pr-description (fetched from GitHub when first asked for, then
// the server's copy while the PR is unchanged). The last few are kept here
// too, by the PR's last-updated time, so stepping back and forth doesn't
// ask the server again.

export interface PrDescription {
  body: string;
  fetchedAt: string | null;
  // The server couldn't refresh it (`warning` says why): this is its copy.
  stale: boolean;
  warning: string;
}

export const PR_DESCRIPTION_CACHE_LIMIT = 12;
const cache = new Map<string, PrDescription>();
const cacheKey = (key: string, updatedAt: string) => `${key}@${updatedAt}`;

const remember = (key: string, value: PrDescription) => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > PR_DESCRIPTION_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

// For tests.
export const clearPrDescriptionCache = () => cache.clear();

const fetchWithTimeout = createFetchWithTimeout((input, init) => fetch(input, init));

export interface PrDescriptionState {
  description: PrDescription | null;
  loading: boolean;
  // Why it couldn't be fetched (with no copy to show), else "".
  error: string;
  retry: () => void;
}

export function usePrDescription(repo: string, prNumber: string, updatedAt: string): PrDescriptionState {
  const key = cacheKey(buildPrEntryKey(repo, prNumber), updatedAt);
  const [state, setState] = useState<{ key: string; description: PrDescription | null; error: string }>({ key: '', description: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  // A stale copy is shown but asked for again next time, in case GitHub's back.
  const cached = cache.get(key);

  useEffect(() => {
    if (!repo || !prNumber || cache.get(key)?.stale === false) return undefined;
    let cancelled = false;
    setState({ key, description: null, error: '' });
    const query = new URLSearchParams({ repo, prNumber }).toString();
    fetchWithTimeout(`/view-prs/pr-description?${query}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result?.ok === false) throw new Error(result?.error || `HTTP ${response.status}`);
        const description: PrDescription = {
          body: String(result.body || ''),
          fetchedAt: result.fetchedAt || null,
          stale: result.stale === true,
          warning: String(result.warning || ''),
        };
        remember(key, description);
        if (!cancelled) setState({ key, description, error: '' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key, description: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, repo, prNumber, attempt]);

  const own = state.key === key ? state : null;
  const description = own?.description || cached || null;
  const error = description ? '' : own?.error || '';
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { description, loading: !description && !error, error, retry };
}
