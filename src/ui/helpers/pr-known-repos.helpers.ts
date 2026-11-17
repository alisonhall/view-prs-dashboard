import type { PrDataPayload } from '../types/pr-data.ts';

// The repos the page knows of, for the repo pickers' suggestions: those
// subscribed, those PRs were added from, and those of the rows shown -
// each once, sorted. Not the "owner/repo" placeholder.
export const listKnownRepos = (payload: PrDataPayload | null | undefined): string[] => {
  const repos = new Set<string>();
  const add = (repo: unknown) => {
    const value = String(repo || '').trim();
    if (/^[^/\s]+\/[^/\s]+$/.test(value) && value.toLowerCase() !== 'owner/repo') repos.add(value);
  };
  const sources = payload?.dataMeta?.sources;
  (sources?.subscriptions || []).forEach((entry) => add(entry.repo));
  (sources?.trackedPrs || []).forEach((entry) => add(entry.repo));
  Object.values(payload?.byPrNumber || {}).forEach((entry) => add(entry?.repo));
  return [...repos].sort((a, b) => a.localeCompare(b));
};
