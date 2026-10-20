import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FilterStateContext } from './FilterStateContext';
import { useDebouncedEffect } from './useDebouncedCallback';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useAuthorThreadResolutionSelection } from './AuthorThreadResolutionSelectionContext';
import { useChangeFilterActorSelection } from './ChangeFilterActorSelectionContext';
import { createPrUiOptionPersistenceHelpers } from '../helpers/pr-ui-option-persistence.helpers.js';
import { setPendingMultiSelectSelection } from '../helpers/pr-pending-multi-select-selections.helpers.js';
import { formatCommitPatternsForTextarea } from '../helpers/form-parsing.helpers.js';

// Built once, not per-render - zero per-instance dependency other than the
// real fetch (same "stable, zero-per-render-state" precedent as
// AuthorInsightsProvider.jsx's own module-level stableDisplay).
const { getUiOptionDefaults, FILTER_STATE_FIELD_MAP, readUiSessionOverrides, writeUiSessionOverrides } =
  createPrUiOptionPersistenceHelpers({ fetch: (...args) => fetch(...args) });

const parseCsvTokens = (rawValue) =>
  String(rawValue || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

const TEXT_FIELD_IDS = [
  'repo',
  'limit',
  'merged-limit',
  'jobs',
  'pr-numbers',
  'open-mode',
  'scope-mode',
  'filter-pr-numbers',
  'attention-no-activity-mode',
  'attention-author-thread-resolution-mode',
  'filter-custom-comments',
  'filter-other-notes',
  'filter-pr-difficulty',
  'filter-rally-stories',
  'filter-rally-links',
  'filter-analysis-of-pr',
];

const CHECKBOX_FIELD_IDS = [
  'ack-changed',
  'show-reason',
  'quiet',
  'always-show-in-review',
  'attention-include-pending-comments',
  'attention-ignore-merge-only-commits',
  'attention-include-closed-merged',
  'attention-include-draft-changed',
  'attention-include-draft-no-activity',
];

/**
 * Phase 6 (see REACT_MIGRATION_PLAN.md): owns the Context state for every
 * filter field migrated off the vanilla DOM-is-the-source-of-truth
 * pattern. Used to also replace `filterChangeDebounceTimer`/
 * `debouncedApplyFilters` (index.page.js) for exactly these fields via a
 * mirrored debounced effect - Phase H.26 (see REACT_MIGRATION_PLAN.md,
 * "Remaining-effort audit", cluster 1) deleted that bridge and this
 * file's own effect calling it outright, confirmed to have had zero
 * remaining real effect.
 *
 * Exposes `window.getFilterStateValues()`/`window.setFilterStateValue(key, value)`
 * so vanilla code (the render pipeline's DOM-read call sites) can read/write
 * Context state without needing its own React tree - same
 * handled/fallback bridge shape every Phase 2/3 conversion already uses,
 * just in the read direction as well as the update direction.
 *
 * Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): also
 * owns UI option persistence now - a mount-only effect restores saved
 * overrides from `/view-prs/user-defaults` directly into `values` (a plain
 * `setValues` call, not `window.setFilterStateValue`/`flushSync` - this
 * runs *inside* this Provider's own effect, not from vanilla code reaching
 * in, so there's no cross-boundary reentrancy to guard against the way
 * `index.page.js`'s old `restoreUiOptionOverrides` needed `queueMicrotask`/
 * a `'viewprs:react-ready'` second pass for), and `persistRunScriptOptions`/
 * `persistViewFilterOptions` are exposed as `window.persistRunScriptOptionOverrides`/
 * `window.persistViewFilterOptionOverrides` - the *same* bridge names
 * `index.page.js`'s old `persistRunScriptOptionOverrides`/
 * `persistViewFilterOptionOverrides` used, so every existing caller (the
 * "Run script"/"Apply filters (local)" buttons, the 3 vanilla "change"
 * listener branches) needed zero changes - only what's *behind* those
 * names moved. Save *trigger points* (when a save happens) are
 * deliberately unchanged - that's a product decision (not every field
 * auto-persists on every keystroke), not an implementation detail: only
 * the *mechanics* of getting there were simplified.
 *
 * The 9 multi-select lists' "pending selections" restore unchanged
 * (`setPendingMultiSelectSelection`, imported directly - that store is
 * deliberately `window`-level already, see its own file's comment, so
 * calling it from here is no different than index.page.js calling it).
 *
 * Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
 * 9 lists' *persist* side (`buildOverrides` below) now reads
 * `useRowFilterSelection()`/`useAuthorThreadResolutionSelection()`/
 * `useChangeFilterActorSelection()` directly, instead of the
 * `window.getSelectedAuthorLogins` etc. DOM-scan bridges it used before -
 * this Provider had to become a genuine descendant of all 3 Contexts for
 * that (see react-app.jsx's own Provider-tree comment). The bridges
 * themselves had no caller left anywhere once this phase landed, and were
 * deleted in Phase H.10; `index.page.js`'s separate `getFormBody()` call
 * (its last remaining plain-function-call reader) was itself deleted in
 * Phase H.20, and the underlying DOM-scan functions followed in a later
 * cleanup pass once nothing called them at all.
 */
export function FilterStateProvider({ initialValues, children }) {
  const [values, setValues] = useState(initialValues);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // buildOverrides below reads these 3 Contexts directly instead of the
  // window.getSelectedXxx DOM-scan bridges those lists used to be checked-
  // state-only-in-the-DOM for - requires this Provider to be a genuine
  // descendant of all 3 (see react-app.jsx's own Provider-tree comment for
  // why that reorder was needed).
  const rowFilterSelection = useRowFilterSelection();
  const authorThreadResolutionSelection = useAuthorThreadResolutionSelection();
  const changeFilterActorSelection = useChangeFilterActorSelection();

  const setValue = useCallback((key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  // Restores saved overrides once, on mount. See this file's own header
  // comment for why this needs no flushSync/queueMicrotask trickery: it's
  // a plain "fetch then setState" effect running inside this Provider's
  // own lifecycle, not vanilla code reaching into React from outside.
  useEffect(() => {
    let cancelled = false;

    const restorePending = (key, list) => {
      setPendingMultiSelectSelection(
        key,
        (Array.isArray(list) ? list : []).map((value) => String(value || '').trim()).filter(Boolean),
      );
    };

    (async () => {
      const overrides = await readUiSessionOverrides();
      if (cancelled || !overrides || Object.keys(overrides).length === 0) {
        return;
      }

      const mapped = {};
      Object.entries(FILTER_STATE_FIELD_MAP).forEach(([fieldId, contextKey]) => {
        if (Object.prototype.hasOwnProperty.call(overrides, fieldId)) {
          mapped[contextKey] = overrides[fieldId];
        }
      });

      const changeFilters =
        overrides.changeFilters && typeof overrides.changeFilters === 'object' && !Array.isArray(overrides.changeFilters)
          ? overrides.changeFilters
          : null;
      if (changeFilters) {
        if (typeof changeFilters.useBuiltinMergePattern === 'boolean') {
          mapped.changeFilterUseBuiltinMergePattern = changeFilters.useBuiltinMergePattern;
        }
        if (Array.isArray(changeFilters.ignoreCommitPatterns)) {
          mapped.changeFilterIgnoreCommitPatterns = formatCommitPatternsForTextarea(
            changeFilters.ignoreCommitPatterns,
          );
        }
      }

      if (Object.keys(mapped).length > 0) {
        setValues((previous) => ({ ...previous, ...mapped }));
      }

      // index.page.js's old 2nd restore pass (on 'viewprs:react-ready')
      // called refreshAvailableRepoLabels() once the real configured repo
      // was known - passing the override value directly here instead of
      // relying on a later DOM read sidesteps the timing problem that
      // required a second pass at all (setValues above is async relative
      // to this synchronous code - the #repo input's DOM value wouldn't
      // reflect it yet). applyResolvedRepo (index.page.js) already covers
      // the no-override/default-repo case via the render pipeline; this
      // is specifically for when a *saved* repo differs from whatever that
      // path already (possibly prematurely) fetched labels for.
      if (overrides.repo) {
        window.refreshAvailableRepoLabels?.(overrides.repo);
      }

      if (Array.isArray(overrides.author)) {
        restorePending('pendingAuthorSelections', overrides.author);
      }
      if (Array.isArray(overrides.assigned)) {
        restorePending('pendingAssignedSelections', overrides.assigned);
      }
      if (Array.isArray(overrides.approver)) {
        restorePending('pendingApproverSelections', overrides.approver);
      }
      if (Object.prototype.hasOwnProperty.call(overrides, 'label')) {
        restorePending(
          'pendingLabelSelections',
          Array.isArray(overrides.label) ? overrides.label : parseCsvTokens(overrides.label),
        );
      }
      if (Object.prototype.hasOwnProperty.call(overrides, 'exclude-label')) {
        restorePending(
          'pendingExcludeLabelSelections',
          Array.isArray(overrides['exclude-label'])
            ? overrides['exclude-label']
            : parseCsvTokens(overrides['exclude-label']),
        );
      }
      if (Array.isArray(overrides['attention-author-thread-resolution-allow'])) {
        restorePending(
          'pendingAuthorThreadResolutionAllowSelections',
          overrides['attention-author-thread-resolution-allow'],
        );
      }
      if (Array.isArray(overrides['attention-author-thread-resolution-deny'])) {
        restorePending(
          'pendingAuthorThreadResolutionDenySelections',
          overrides['attention-author-thread-resolution-deny'],
        );
      }
      if (changeFilters) {
        if (Array.isArray(changeFilters.ignoreCommentsFromAuthors)) {
          restorePending('pendingChangeFilterIgnoreCommentAuthors', changeFilters.ignoreCommentsFromAuthors);
        }
        if (Array.isArray(changeFilters.ignoreReviewsFromAuthors)) {
          restorePending('pendingChangeFilterIgnoreReviewAuthors', changeFilters.ignoreReviewsFromAuthors);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Shared by persistRunScriptOptions/persistViewFilterOptions below -
  // mirrors index.page.js's old persistUiOptionOverrides(fieldIds) exactly,
  // reading current values from valuesRef instead of Context/DOM bridges
  // (this Provider already *is* the Context) and the vanilla DOM-checkbox
  // getters via window.* bridges for the 9 multi-select fields, which stay
  // DOM-owned (see this file's own header comment).
  const buildOverrides = useCallback((fieldIds, existingOverrides) => {
    const defaults = getUiOptionDefaults();
    const overrides = { ...existingOverrides };
    const includeField = (id) => fieldIds.includes(id);
    const currentValues = valuesRef.current;

    const getText = (fieldId) => String(currentValues[FILTER_STATE_FIELD_MAP[fieldId]] ?? '').trim();
    const getCheckbox = (fieldId) => Boolean(currentValues[FILTER_STATE_FIELD_MAP[fieldId]]);

    TEXT_FIELD_IDS.forEach((id) => {
      if (!includeField(id)) return;
      const value = getText(id);
      if (value !== String(defaults[id] || '')) {
        overrides[id] = value;
      } else {
        delete overrides[id];
      }
    });

    CHECKBOX_FIELD_IDS.forEach((id) => {
      if (!includeField(id)) return;
      const value = getCheckbox(id);
      if (value !== Boolean(defaults[id])) {
        overrides[id] = value;
      } else {
        delete overrides[id];
      }
    });

    const setArrayField = (id, getSelected) => {
      if (!includeField(id)) return;
      const selected = getSelected() || [];
      if (selected.length > 0) {
        overrides[id] = selected;
      } else {
        delete overrides[id];
      }
    };
    const checkedList = (checkedByListId, listId) => Array.from(checkedByListId[listId] || []);
    setArrayField('author', () => checkedList(rowFilterSelection.checkedByListId, 'author-list'));
    setArrayField('assigned', () => checkedList(rowFilterSelection.checkedByListId, 'assigned-list'));
    setArrayField('approver', () => checkedList(rowFilterSelection.checkedByListId, 'approver-list'));
    setArrayField('attention-author-thread-resolution-allow', () =>
      checkedList(
        authorThreadResolutionSelection.checkedByListId,
        'attention-author-thread-resolution-allow-list',
      ),
    );
    setArrayField('attention-author-thread-resolution-deny', () =>
      checkedList(
        authorThreadResolutionSelection.checkedByListId,
        'attention-author-thread-resolution-deny-list',
      ),
    );

    if (includeField('label')) {
      const selected = checkedList(rowFilterSelection.checkedByListId, 'label-list');
      if (selected.length > 0) {
        overrides.label = selected.join(', ');
      } else {
        delete overrides.label;
      }
    }
    if (includeField('exclude-label')) {
      const selected = checkedList(rowFilterSelection.checkedByListId, 'exclude-label-list');
      if (selected.length > 0) {
        overrides['exclude-label'] = selected.join(', ');
      } else {
        delete overrides['exclude-label'];
      }
    }

    if (
      includeField('change-filter-use-builtin-merge-pattern') ||
      includeField('change-filter-ignore-comment-authors') ||
      includeField('change-filter-ignore-review-authors') ||
      includeField('change-filter-ignore-commit-patterns')
    ) {
      const existingChangeFilters =
        existingOverrides.changeFilters &&
        typeof existingOverrides.changeFilters === 'object' &&
        !Array.isArray(existingOverrides.changeFilters)
          ? existingOverrides.changeFilters
          : {};
      const changeFilters = { ...existingChangeFilters };

      if (includeField('change-filter-use-builtin-merge-pattern')) {
        const useBuiltin = getCheckbox('change-filter-use-builtin-merge-pattern');
        if (useBuiltin !== true) {
          changeFilters.useBuiltinMergePattern = useBuiltin;
        } else {
          delete changeFilters.useBuiltinMergePattern;
        }
      }
      if (includeField('change-filter-ignore-comment-authors')) {
        const selected = checkedList(
          changeFilterActorSelection.checkedByListId,
          'change-filter-ignore-comment-authors-list',
        );
        if (selected.length > 0) {
          changeFilters.ignoreCommentsFromAuthors = selected;
        } else {
          delete changeFilters.ignoreCommentsFromAuthors;
        }
      }
      if (includeField('change-filter-ignore-review-authors')) {
        const selected = checkedList(
          changeFilterActorSelection.checkedByListId,
          'change-filter-ignore-review-authors-list',
        );
        if (selected.length > 0) {
          changeFilters.ignoreReviewsFromAuthors = selected;
        } else {
          delete changeFilters.ignoreReviewsFromAuthors;
        }
      }
      if (includeField('change-filter-ignore-commit-patterns')) {
        const patterns = String(currentValues.changeFilterIgnoreCommitPatterns || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        if (patterns.length > 0) {
          changeFilters.ignoreCommitPatterns = patterns;
        } else {
          delete changeFilters.ignoreCommitPatterns;
        }
      }

      if (Object.keys(changeFilters).length > 0) {
        overrides.changeFilters = changeFilters;
      } else {
        delete overrides.changeFilters;
      }
    }

    return overrides;
  }, [rowFilterSelection, authorThreadResolutionSelection, changeFilterActorSelection]);

  const persistRunScriptOptions = useCallback(async () => {
    const existingOverrides = await readUiSessionOverrides();
    const overrides = buildOverrides(
      ['repo', 'limit', 'merged-limit', 'jobs', 'pr-numbers', 'open-mode', 'ack-changed', 'show-reason', 'quiet'],
      existingOverrides,
    );
    await writeUiSessionOverrides(overrides);
  }, [buildOverrides]);

  const persistViewFilterOptions = useCallback(async () => {
    const existingOverrides = await readUiSessionOverrides();
    const overrides = buildOverrides(
      [
        'scope-mode',
        'filter-pr-numbers',
        'label',
        'exclude-label',
        'author',
        'assigned',
        'approver',
        'always-show-in-review',
        'attention-no-activity-mode',
        'attention-include-pending-comments',
        'attention-ignore-merge-only-commits',
        'attention-include-closed-merged',
        'attention-include-draft-changed',
        'attention-include-draft-no-activity',
        'attention-author-thread-resolution-mode',
        'attention-author-thread-resolution-allow',
        'attention-author-thread-resolution-deny',
        'change-filter-use-builtin-merge-pattern',
        'change-filter-ignore-comment-authors',
        'change-filter-ignore-review-authors',
        'change-filter-ignore-commit-patterns',
        'filter-custom-comments',
        'filter-other-notes',
        'filter-pr-difficulty',
        'filter-rally-stories',
        'filter-rally-links',
        'filter-analysis-of-pr',
      ],
      existingOverrides,
    );
    await writeUiSessionOverrides(overrides);
  }, [buildOverrides]);

  useEffect(() => {
    window.getFilterStateValues = () => valuesRef.current;
    // Phase 6, Slice 7 (see REACT_MIGRATION_PLAN.md): flushSync-wrapped so
    // a write is synchronously visible to any window.getFilterStateValues()
    // read that follows in the same call stack. The 9 multi-select lists'
    // "pending selections" no longer go through this bridge at all (Phase
    // 7, sub-phase 7.4 - see pr-pending-multi-select-selections.helpers.js),
    // so this flushSync is no longer load-bearing for them specifically,
    // only for the other FILTER_STATE_FIELD_MAP-mapped fields still routed
    // through here.
    window.setFilterStateValue = (key, value) => {
      flushSync(() => setValue(key, value));
    };
    // Phase E (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // same bridge names index.page.js's own persistRunScriptOptionOverrides/
    // persistViewFilterOptionOverrides used - see this file's own header
    // comment for why no caller needed to change.
    window.persistRunScriptOptionOverrides = (...args) => persistRunScriptOptions(...args);
    window.persistViewFilterOptionOverrides = (...args) => persistViewFilterOptions(...args);
    return () => {
      delete window.getFilterStateValues;
      delete window.setFilterStateValue;
      delete window.persistRunScriptOptionOverrides;
      delete window.persistViewFilterOptionOverrides;
    };
  }, [setValue, persistRunScriptOptions, persistViewFilterOptions]);

  // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): the useDebouncedEffect call that used to live here,
  // triggering window.debouncedApplyFilters() 150ms after any of 12
  // listed fields changed, was deleted outright when that bridge was
  // deleted (confirmed to have had zero remaining real re-filtering
  // effect once renderPrData's own dead pipeline was removed in H.23).
  //
  // H.26 follow-up, found during code review of that same change: the
  // "Apply filters (local)" button this phase also deleted had a SECOND
  // call, window.persistViewFilterOptionOverrides?.() - its removal left
  // every one of this Provider's own 26 persist-relevant fields relying
  // entirely on index.page.js's vanilla delegated "change" listeners to
  // auto-persist, which only fire for a real native DOM event. That
  // misses any Context-only change with no native event at all - most
  // notably TableFilterChips.jsx's "x" button, which calls
  // setValue/toggle directly (see that hook's own header comment) and
  // never touches the DOM. Reinstating a debounced watcher here, this
  // time correctly pointed at persistViewFilterOptions (not the old,
  // wrong "apply" target), closes that gap uniformly for every field
  // this Provider owns - both FilterStateContext's own `values` and the
  // 3 selection Contexts' checked-list state, regardless of what
  // triggered the change. This is a deliberate "double-hookup" with the
  // vanilla listeners for native-event-driven changes (the same
  // harmless redundancy several other fields in this migration already
  // have) - the real gap this closes is the Context-only path those
  // listeners can never see.
  useDebouncedEffect(
    () => {
      persistViewFilterOptions();
    },
    [values, rowFilterSelection, authorThreadResolutionSelection, changeFilterActorSelection],
    150,
  );

  return (
    <FilterStateContext.Provider value={{ values, setValue }}>
      {children}
    </FilterStateContext.Provider>
  );
}
