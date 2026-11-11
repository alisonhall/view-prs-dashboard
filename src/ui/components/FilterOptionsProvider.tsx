import { useMemo, useRef, type ReactNode } from 'react';
import { FilterOptionsContext, type FilterOption, type FilterOptionsValue } from '../state/FilterOptionsContext';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.ts';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';
import { extractRowLabelNames, normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.ts';
import { createEntryDerivedCache, type EntryDerivedCache } from '../helpers/pr-entry-derived-cache.helpers.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import { getPrLastActivityTime, groupAuthorOptionsByActivity } from '../helpers/author-picker.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

// [value, label] pairs.
type OptionEntry = [string, string];

const sortByDisplayName = (entries: OptionEntry[]): OptionEntry[] =>
  entries.sort((a, b) => {
    const textA = String(a[1] || a[0]).toLowerCase();
    const textB = String(b[1] || b[0]).toLowerCase();
    return textA.localeCompare(textB);
  });

const toOptions = (entries: OptionEntry[]): FilterOption[] => entries.map(([value, label]) => ({ value, label }));

/**
 * Derives the 9 multi-select filter lists' option lists from
 * PrDataContext's payload (via usePrData()) and ActorIdentityContext.
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up (see react-app.tsx for the
 * actual nesting). It genuinely consumes usePrData(), like
 * ReviewStatsProvider, so it re-renders when the payload changes.
 *
 * Checked state (which options are ticked) is NOT computed here - it is
 * seeded by ListSelectionSeeding (state/useListSelectionSeeding.ts) via
 * pr-multi-select-checked-state.helpers.ts's seedCheckedState.
 *
 * Authors are listed as the Authors view's picker lists them: those with a
 * PR updated in the last RECENTLY_ACTIVE_DAYS first, newest first, under
 * "Recent PRs", then "Everyone else" by name (author-picker.helpers.ts).
 *
 * The 4 actor-map-based lists (thread-resolution allow/deny, change-filter
 * ignore-comment/review-authors) are the same derivation (every actor in
 * actorsMap, sorted by display name), computed once as `actorOptions`.
 *
 * Performance: `payload` gets a new reference on every poll tick (~30s)
 * whether or not any PR changed. So that extractRowLabelNames/
 * collectAssignedUsers/collectApproversFromRow (the latter two walk
 * activityTimeline/commits/reviewers) don't re-run for every entry each
 * time, their per-entry results go in a WeakMap-keyed cache
 * (createEntryDerivedCache, also used by useVisiblePrNumbers.tsx) held in
 * a ref: an entry whose reference is unchanged across a poll
 * (mergeDataDeltaPayload keeps unchanged entries' references) reuses its
 * cached values. Only the raw entry-derived output is cached, not the
 * display-name resolution, which is cheap (once per unique login) and
 * reads the current `actorsMap` every time. Accepted tradeoff, as in
 * pr-row-filtering.helpers.ts: if the actor-login-alias map changes
 * without the entry changing, a cached value can lag until the entry
 * changes.
 */
export function FilterOptionsProvider({ children }: { children?: ReactNode }) {
  const { payload, selectedRepo } = usePrData();
  const { getPreferredActorKey, resolveActorDisplayName, normalizeActorLogin } = useActorIdentity();
  const cacheRef = useRef<EntryDerivedCache | null>(null);
  if (!cacheRef.current) {
    cacheRef.current = createEntryDerivedCache();
  }
  const cache = cacheRef.current;

  const value = useMemo<FilterOptionsValue>(() => {
    const allEntries = Object.values(payload?.byPrNumber || {});
    const repoFilter = String(selectedRepo || '').trim();
    const actorsMap: ActorsMap = payload?.actorsMap && typeof payload.actorsMap === 'object' ? payload.actorsMap : {};
    const scopedEntries = repoFilter ? allEntries.filter((entry) => entry?.repo === repoFilter) : allEntries;
    const { getOrCompute } = cache;

    const { collectAssignedUsers } = createPrAssignedUsersHelpers({
      asArray,
      normalizeActorLogin,
      resolveActorDisplayName,
    });
    const { collectApproversFromRow } = createPrApproversHelpers({
      asArray,
      getPreferredActorKey,
      resolveActorDisplayName,
      formatIsoDatetime,
    });

    // Every repo with a stored row, not only the selected one's.
    const repoOptions = Array.from(new Set(allEntries.map((entry) => String(entry?.repo || '').trim()).filter(Boolean)))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((repo) => ({ value: repo, label: repo }));

    const labelsByToken = new Map<string, string>();
    scopedEntries.forEach((entry) => {
      getOrCompute(entry, 'labelNames', () => extractRowLabelNames(entry?.data || {})).forEach((labelName) => {
        const token = normalizeFilterToken(labelName);
        if (!token || labelsByToken.has(token)) return;
        labelsByToken.set(token, labelName);
      });
    });
    const labelOptions = Array.from(labelsByToken.values())
      .map((labelName) => ({ value: labelName, label: labelName }))
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

    const authors = new Map<string, string>();
    const lastActiveByLogin = new Map<string, { lastActiveAt: number }>();
    scopedEntries.forEach((entry) => {
      const row = entry?.data || {};
      const login = getOrCompute(entry, 'preferredAuthorKey', () => getPreferredActorKey(row.authorLogin, row.author));
      if (!login) return;
      const lastActiveAt = Math.max(lastActiveByLogin.get(login)?.lastActiveAt ?? Number.NEGATIVE_INFINITY, getPrLastActivityTime(entry));
      lastActiveByLogin.set(login, { lastActiveAt });
      if (authors.has(login)) return;
      authors.set(login, resolveActorDisplayName(login, actorsMap, String(row.author || '').trim()));
    });
    const { recent, others } = groupAuthorOptionsByActivity(
      sortByDisplayName(Array.from(authors.entries())).map(([login, label]) => ({ login, label })),
      lastActiveByLogin,
      Date.now(),
    );
    const authorOptions: FilterOption[] = [
      ...recent.map(({ login, label }) => ({ value: login, label, group: 'Recent PRs' })),
      ...others.map(({ login, label }) => ({ value: login, label, group: 'Everyone else' })),
    ];

    const assignees = new Map<string, string>();
    scopedEntries.forEach((entry) => {
      getOrCompute(entry, 'assignedUsers', () => collectAssignedUsers(entry?.data || {})).forEach((assignee) => {
        const login = String(assignee?.login || '').trim();
        if (!login || assignees.has(login)) return;
        assignees.set(login, resolveActorDisplayName(login, actorsMap, assignee?.name));
      });
    });
    const assignedOptions = toOptions(sortByDisplayName(Array.from(assignees.entries())));

    const approvers = new Map<string, string>();
    scopedEntries.forEach((entry) => {
      getOrCompute(entry, 'approversFromRow', () => collectApproversFromRow(entry?.data || {})).forEach((approver) => {
        const login = String(approver?.login || '').trim();
        if (!login || approvers.has(login)) return;
        approvers.set(login, resolveActorDisplayName(login, actorsMap, approver?.name));
      });
    });
    const approverOptions = toOptions(sortByDisplayName(Array.from(approvers.entries())));

    const actorOptions = toOptions(
      sortByDisplayName(
        Object.entries(actorsMap)
          .map(([login, displayName]) => {
            const loginValue = String(login || '').trim();
            if (!loginValue) return null;
            return [loginValue, resolveActorDisplayName(loginValue, actorsMap, displayName)] as OptionEntry;
          })
          .filter((entry): entry is OptionEntry => entry !== null),
      ),
    );

    return {
      repoOptions,
      labelOptions,
      excludeLabelOptions: labelOptions,
      authorOptions,
      assignedOptions,
      approverOptions,
      authorThreadResolutionAllowOptions: actorOptions,
      authorThreadResolutionDenyOptions: actorOptions,
      changeFilterIgnoreCommentAuthorsOptions: actorOptions,
      changeFilterIgnoreReviewAuthorsOptions: actorOptions,
    };
  }, [cache, payload, selectedRepo, getPreferredActorKey, resolveActorDisplayName, normalizeActorLogin]);

  return <FilterOptionsContext.Provider value={value}>{children}</FilterOptionsContext.Provider>;
}
