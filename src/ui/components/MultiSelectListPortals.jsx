import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MultiSelectCheckboxList } from './MultiSelectCheckboxList';
import { useFilterOptions } from '../state/FilterOptionsContext';
import * as prMultiSelectRenderCacheHelperFactory from '../helpers/pr-multi-select-render-cache.helpers.js';
import { seedCheckedState } from '../helpers/pr-multi-select-checked-state.helpers.js';
import { normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.js';
import {
  getPendingMultiSelectSelection,
  setPendingMultiSelectSelection,
  subscribeToPendingMultiSelectSelections,
} from '../helpers/pr-pending-multi-select-selections.helpers.js';

/**
 * Multi-select checkbox lists (Phase 2 - see REACT_MIGRATION_PLAN.md).
 * Unlike every field in FilterStateProvider, these lists' *options* are
 * rebuilt from the PR payload on every data (re)load - see
 * MultiSelectCheckboxList.jsx's own comment for why each render uses an
 * incrementing `key` instead of relying on prop diffing. React mounts
 * directly into the existing `<div id="...-list">` container (like Phase
 * 1's #pr-sections), not a wrapper span, so no index.html/index.css change
 * is needed for these.
 *
 * MULTI_SELECT_LIST_ID_PREFIXES maps each list's container id to the
 * checkbox-id prefix its options previously used (the vanilla fallback's
 * own id-generation scheme, since removed along with the rest of its
 * DOM-building code from pr-filter-panel.helpers.js) so generated ids stay
 * stable across the conversion. Covers every multi-select in the app.
 */
export const MULTI_SELECT_LIST_ID_PREFIXES = {
  'label-list': 'label',
  'exclude-label-list': 'exclude-label',
  'author-list': 'author',
  'assigned-list': 'assigned',
  'approver-list': 'approver',
  'attention-author-thread-resolution-allow-list': 'attention-author-thread-resolution-allow',
  'attention-author-thread-resolution-deny-list': 'attention-author-thread-resolution-deny',
  'change-filter-ignore-comment-authors-list': 'change-filter-ignore-comment-authors',
  'change-filter-ignore-review-authors-list': 'change-filter-ignore-review-authors',
};

// Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): each list's pure
// option list, as a key into useFilterOptions()'s value (FilterOptionsProvider.jsx).
const MULTI_SELECT_OPTIONS_KEYS = {
  'label-list': 'labelOptions',
  'exclude-label-list': 'excludeLabelOptions',
  'author-list': 'authorOptions',
  'assigned-list': 'assignedOptions',
  'approver-list': 'approverOptions',
  'attention-author-thread-resolution-allow-list': 'authorThreadResolutionAllowOptions',
  'attention-author-thread-resolution-deny-list': 'authorThreadResolutionDenyOptions',
  'change-filter-ignore-comment-authors-list': 'changeFilterIgnoreCommentAuthorsOptions',
  'change-filter-ignore-review-authors-list': 'changeFilterIgnoreReviewAuthorsOptions',
};

// Each list's restore-time seed value - see
// pr-pending-multi-select-selections.helpers.js for why this is a
// dedicated window-level store rather than FilterStateProvider's Context.
const MULTI_SELECT_PENDING_KEYS = {
  'label-list': 'pendingLabelSelections',
  'exclude-label-list': 'pendingExcludeLabelSelections',
  'author-list': 'pendingAuthorSelections',
  'assigned-list': 'pendingAssignedSelections',
  'approver-list': 'pendingApproverSelections',
  'attention-author-thread-resolution-allow-list': 'pendingAuthorThreadResolutionAllowSelections',
  'attention-author-thread-resolution-deny-list': 'pendingAuthorThreadResolutionDenySelections',
  'change-filter-ignore-comment-authors-list': 'pendingChangeFilterIgnoreCommentAuthors',
  'change-filter-ignore-review-authors-list': 'pendingChangeFilterIgnoreReviewAuthors',
};

// Only the label lists match selections case/whitespace-insensitively
// (see pr-filter-label-extraction.helpers.js's normalizeFilterToken) -
// every other list matches on the raw login value.
const MULTI_SELECT_NORMALIZE_TOKEN = {
  'label-list': normalizeFilterToken,
  'exclude-label-list': normalizeFilterToken,
};

/**
 * Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): renders the 9
 * multi-select filter lists, replacing the imperative
 * window.renderReactMultiSelectList bridge (which used to be called by the
 * now-deleted vanilla populateXOptions functions). Must be mounted inside
 * <FilterOptionsProvider> - it consumes it directly via useFilterOptions()
 * rather than receiving pushed state, same reasoning as
 * ReviewStatsProvider/AuthorInsightsProvider elsewhere in this app.
 *
 * Extracted into its own module (not inlined in react-app.jsx) so
 * src/ui/integration-tests/index.html.test.js's own test harness - which
 * never loads react-app.jsx itself (that file auto-mounts <AppRoot/> as an
 * import-time side effect) - can import and reuse this exact component
 * rather than hand-duplicating its logic a second time.
 *
 * Each list's checked state still has to be seeded imperatively (read the
 * currently-checked DOM values, or fall back to a pending restore-time
 * selection - see pr-multi-select-checked-state.helpers.js's
 * seedCheckedState) since that state lives in MultiSelectCheckboxList's own
 * local component state, not anywhere this component can read via props/
 * Context. The render-cache (createMultiSelectRenderCache) is preserved
 * unchanged from index.page.js's former renderMultiSelectListSkipUnchanged
 * so an unchanged list still doesn't force a remount on every poll tick.
 */
export function MultiSelectListPortals({ containers }) {
  const filterOptions = useFilterOptions();
  const [renderState, setRenderState] = useState({});
  const renderCacheRef = useRef(null);
  if (!renderCacheRef.current) {
    renderCacheRef.current = prMultiSelectRenderCacheHelperFactory.createMultiSelectRenderCache();
  }

  // A pending-selection write (restoreUiOptionOverrides, index.page.js) can
  // land well after this component's initial mount, with no guaranteed
  // subsequent payload/option change for the main effect below to
  // piggyback a re-seed on - see pr-pending-multi-select-selections
  // .helpers.js's own comment. This tick forces the main effect to re-run
  // on every such write, regardless of timing.
  const [pendingTick, setPendingTick] = useState(0);
  useEffect(
    () => subscribeToPendingMultiSelectSelections(() => setPendingTick((tick) => tick + 1)),
    [],
  );

  useEffect(() => {
    const cache = renderCacheRef.current;
    const nextRenderState = { ...renderState };
    let didAnyChange = false;
    const pendingClears = [];

    const skipUnchanged = cache.wrapRenderMultiSelectList((listId, items) => {
      nextRenderState[listId] = {
        items,
        renderKey: (renderState[listId]?.renderKey || 0) + 1,
      };
      didAnyChange = true;
      return true;
    });

    Object.keys(MULTI_SELECT_LIST_ID_PREFIXES).forEach((listId) => {
      const container = containers.multiSelect[listId];
      if (!container) return;

      const options = filterOptions[MULTI_SELECT_OPTIONS_KEYS[listId]] || [];
      const pendingKey = MULTI_SELECT_PENDING_KEYS[listId];
      const pendingSelections = getPendingMultiSelectSelection(pendingKey);
      const existingChecked = Array.from(
        container.querySelectorAll("input[type='checkbox']:checked"),
      )
        .map((node) => String(node.value || '').trim())
        .filter(Boolean);

      const { items, shouldClearPending } = seedCheckedState(options, {
        existingChecked,
        pendingSelections,
        normalizeToken: MULTI_SELECT_NORMALIZE_TOKEN[listId],
      });

      skipUnchanged(listId, items);

      if (shouldClearPending) {
        pendingClears.push(pendingKey);
      }
    });

    // Deliberately a plain setState, not flushSync (unlike the former
    // window.renderReactMultiSelectList bridge this replaces): that bridge
    // was called synchronously from *vanilla* code reading the DOM again
    // in the same call stack right after populating - a real need for
    // flushSync there. Every reader of these lists' checked values now
    // (getSelectedAuthorLogins/persistUiOptionOverrides/getFormBody/etc.,
    // see index.page.js) runs from a separate, later user-triggered event
    // (a button click), never synchronously after this effect - and
    // calling flushSync from inside a useEffect risks a genuine
    // "flushSync was called from inside a lifecycle method" React warning
    // when this effect itself fires as part of a parent component's own
    // commit (confirmed via a real Playwright run during this sub-phase).
    if (didAnyChange) {
      setRenderState(nextRenderState);
    }
    pendingClears.forEach((pendingKey) => setPendingMultiSelectSelection(pendingKey, null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containers, filterOptions, pendingTick]);

  return Object.entries(containers.multiSelect).map(([listId, container]) => {
    if (!container) {
      return null;
    }
    const state = renderState[listId];
    return createPortal(
      // key includes renderKey (bumped only when this list's own items
      // signature actually changed, see the render-cache above) so this
      // remounts on every real change, matching MultiSelectCheckboxList's
      // own doc comment - its `checked` state is seeded once from
      // `options` via a lazy useState initializer, not kept in sync with
      // subsequent prop updates.
      <MultiSelectCheckboxList
        key={`${listId}-${state?.renderKey ?? 0}`}
        options={state?.items || []}
        idPrefix={MULTI_SELECT_LIST_ID_PREFIXES[listId]}
        emptyClassContainer={container}
        summaryContainer={containers.multiSelectSummary[listId]}
      />,
      container,
      listId,
    );
  });
}
