import { useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { useActorIdentity } from './ActorIdentityContext';
import { useAuthorInsights } from './AuthorInsightsContext';
import {
  groupAuthorOptionsByActivity,
  summarizeAuthorActivity,
  type AuthorActivity,
} from '../helpers/author-picker.helpers.ts';
import type { AuthorOption } from '../helpers/pr-author-insights-display.helpers.ts';

export interface AuthorPickerOptions {
  // The stored PRs: with none, there are no options either.
  rowCount: number;
  // With a PR updated in the last RECENTLY_ACTIVE_DAYS, newest first.
  recent: AuthorOption[];
  // Everyone else, by name.
  others: AuthorOption[];
  // recent then others: the picker's order, whose first is the author
  // shown when the chosen one isn't there.
  options: AuthorOption[];
  activityByLogin: Map<string, AuthorActivity>;
}

// The Authors view's authors (buildAuthorInsightsEntries: every PR author
// and everyone in actorsMap), those with recently updated PRs first,
// with each one's activity. Worked out again when the stored PRs change.
export function useAuthorPickerOptions(): AuthorPickerOptions {
  const { payload } = usePrData();
  const { buildAuthorInsightsEntries } = useAuthorInsights();
  const { getPreferredActorKey } = useActorIdentity();

  return useMemo(() => {
    const rows = Object.values(payload?.byPrNumber || {});
    const all = rows.length ? buildAuthorInsightsEntries(rows, payload?.actorsMap || {}) : [];
    const activityByLogin = summarizeAuthorActivity(rows, getPreferredActorKey);
    const { recent, others } = groupAuthorOptionsByActivity(all, activityByLogin, Date.now());
    return { rowCount: rows.length, recent, others, options: [...recent, ...others], activityByLogin };
  }, [payload, buildAuthorInsightsEntries, getPreferredActorKey]);
}
