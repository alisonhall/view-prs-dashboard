import { useMemo } from 'react';
import { FilterOptionsContext } from '../state/FilterOptionsContext';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.js';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { extractRowLabelNames, normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);

const sortByDisplayName = (entries) =>
  entries.sort((a, b) => {
    const textA = String(a[1] || a[0]).toLowerCase();
    const textB = String(b[1] || b[0]).toLowerCase();
    return textA.localeCompare(textB);
  });

const toOptions = (entries) => entries.map(([value, label]) => ({ value, label }));

/**
 * Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): derives the 9
 * multi-select filter lists' option lists straight from PrDataContext's
 * payload (via usePrData()) and ActorIdentityContext, replacing the
 * vanilla populateXOptions functions (pr-filter-panel.helpers.js,
 * index.page.js) this cluster used to be computed by. The logic below is
 * moved verbatim from those deleted functions - only *where* it runs has
 * changed.
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up (see react-app.jsx's AppRoot
 * for the actual nesting) - matches ReviewStatsProvider/AuthorInsightsProvider's
 * own established shape, including genuinely consuming usePrData() (not
 * just wrapping stable children) to avoid the reconciliation-bailout bug
 * documented in REACT_MIGRATION_PLAN.md around sub-phase 7.0's
 * needs-attention writeup.
 *
 * Checked state (which options are ticked) is NOT computed here - that
 * depends on the currently-rendered DOM state and each list's pending
 * restore-time selections, and is seeded by react-app.jsx's
 * MultiSelectListPortals via pr-multi-select-checked-state.helpers.js's
 * seedCheckedState, same as it always was.
 *
 * The 4 actor-map-based lists (thread-resolution allow/deny, change-filter
 * ignore-comment/review-authors) are genuinely identical derivations in
 * the deleted vanilla code (each independently built from the same
 * actorsMap, same sort) - computed once here as `actorOptions` and shared
 * across all 4, rather than recomputing the same result 4 times.
 */
export function FilterOptionsProvider({ children }) {
  const { payload, selectedRepo } = usePrData();
  const { getPreferredActorKey, resolveActorDisplayName, normalizeActorLogin } = useActorIdentity();

  const value = useMemo(() => {
    const allEntries = Object.values(payload?.byPrNumber || {});
    const repoFilter = String(selectedRepo || '').trim();
    const actorsMap = payload?.actorsMap && typeof payload.actorsMap === 'object' ? payload.actorsMap : {};
    const scopedEntries = repoFilter ? allEntries.filter((entry) => entry?.repo === repoFilter) : allEntries;

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

    const labelsByToken = new Map();
    scopedEntries.forEach((entry) => {
      extractRowLabelNames(entry?.data || {}).forEach((labelName) => {
        const token = normalizeFilterToken(labelName);
        if (!token || labelsByToken.has(token)) return;
        labelsByToken.set(token, labelName);
      });
    });
    const labelOptions = Array.from(labelsByToken.values())
      .map((labelName) => ({ value: labelName, label: labelName }))
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

    const authors = new Map();
    scopedEntries.forEach((entry) => {
      const row = entry?.data || {};
      const login = getPreferredActorKey(row.authorLogin, row.author);
      if (!login || authors.has(login)) return;
      authors.set(login, resolveActorDisplayName(login, actorsMap, String(row.author || '').trim()));
    });
    const authorOptions = toOptions(sortByDisplayName(Array.from(authors.entries())));

    const assignees = new Map();
    scopedEntries.forEach((entry) => {
      collectAssignedUsers(entry?.data || {}).forEach((assignee) => {
        const login = String(assignee?.login || '').trim();
        if (!login || assignees.has(login)) return;
        assignees.set(login, resolveActorDisplayName(login, actorsMap, assignee?.name));
      });
    });
    const assignedOptions = toOptions(sortByDisplayName(Array.from(assignees.entries())));

    const approvers = new Map();
    scopedEntries.forEach((entry) => {
      collectApproversFromRow(entry?.data || {}).forEach((approver) => {
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
            return [loginValue, resolveActorDisplayName(loginValue, actorsMap, displayName)];
          })
          .filter(Boolean),
      ),
    );

    return {
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
  }, [payload, selectedRepo, getPreferredActorKey, resolveActorDisplayName, normalizeActorLogin]);

  return <FilterOptionsContext.Provider value={value}>{children}</FilterOptionsContext.Provider>;
}
