import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FilterFieldStoreContext,
  FilterStateContext,
  type FilterFieldStoreValue,
  type FilterStateValue,
} from './FilterStateContext';
import { createFilterValuesStore, type FilterValues, type FilterValuesStore } from './filterValuesStore';
import { useDebouncedEffect } from './useDebouncedCallback';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useAuthorThreadResolutionSelection } from './AuthorThreadResolutionSelectionContext';
import { useChangeFilterActorSelection } from './ChangeFilterActorSelectionContext';
import {
  createPrUiOptionPersistenceHelpers,
  type UiOptionOverrides,
} from '../helpers/pr-ui-option-persistence.helpers.ts';
import { setPendingMultiSelectSelection } from '../helpers/pr-pending-multi-select-selections.helpers.ts';
import { formatCommitPatternsForTextarea, parseCsvTokens } from '../helpers/form-parsing.helpers.ts';
import {
  DEFAULT_MERGE_COMMIT_RULES,
  formatRuleLines,
  parseRuleLines,
  type MergeCommitRules,
} from '../helpers/pr-merge-commit-rules.helpers.ts';

// Built once, not per render: its only dependency is the real fetch.
const { getUiOptionDefaults, FILTER_STATE_FIELD_MAP, readUiSessionOverrides, writeUiSessionOverrides } =
  createPrUiOptionPersistenceHelpers({ fetch: (input, init) => fetch(input, init) });

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
  'filter-stories',
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

// The saved changeFilters object, when it is one.
const asChangeFilters = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// The saved mergeCommitRules, when it's an object with the two lists.
const asMergeCommitRules = (value: unknown): MergeCommitRules | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const rules = value as Record<string, unknown>;
  const asList = (list: unknown) => (Array.isArray(list) ? list.map((item) => String(item ?? '').trim()).filter(Boolean) : []);
  return { headlinePatterns: asList(rules.headlinePatterns), logins: asList(rules.logins) };
};

const areListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

// A list's checked values, in insertion order.
const checkedList = <L extends string>(checkedByListId: Partial<Record<L, Set<string>>>, listId: L): string[] =>
  Array.from(checkedByListId[listId] || []);

/**
 * Owns the Run & Filter form's field values (see FilterStateContext.tsx),
 * and saves/restores them as UI option overrides through
 * /view-prs/user-defaults. It publishes no window bridges.
 *
 * Alongside `values` it keeps a per-key store (`filterValuesStore.ts`)
 * for components mounted once per table row (PrSelectionCell), which
 * can't afford a whole-object Context subscription; see
 * `useFilterFieldValue`/`useFilterFieldActions` in FilterStateContext.tsx.
 * Tests read and write the same state through the Context
 * (`test-fixtures/filter-state-probe.jsx`).
 *
 * Restore: a mount-only effect reads the saved overrides into `values`,
 * and hands the 9 multi-select lists' saved selections to
 * `setPendingMultiSelectSelection` (that store is deliberately
 * window-level, see its file's comment) for MultiSelectListPortals to
 * apply once their options exist.
 *
 * Save: `persistRunScriptOptions` (on this Context; react-app.jsx's "Run
 * script" button calls it) saves the run options, and a debounced effect
 * saves the view/filter options whenever `values` or a list selection
 * changes. Which fields each save covers is a product decision (not every
 * field auto-persists), kept from the original behavior.
 *
 * The lists' checked state comes from the RowFilter/AuthorThreadResolution/
 * ChangeFilterActor selection Contexts, so this Provider must be mounted
 * inside all 3 (see react-app.jsx's Provider tree).
 */
export function FilterStateProvider({
  initialValues,
  children,
}: {
  initialValues: FilterValues;
  children?: ReactNode;
}) {
  const [values, setValues] = useState<FilterValues>(initialValues);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // The per-key store mirroring `values` (see the header comment). Every
  // write below goes to both, in the same call, so they never diverge.
  const storeRef = useRef<FilterValuesStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createFilterValuesStore(initialValues);
  }
  // Set just above and never replaced.
  const store = storeRef.current;

  // "A saved repo override was just restored", for RepoLabelsProvider.tsx
  // (a descendant) to fetch that repo's labels. Separate from `values.repo`
  // so editing the repo field doesn't trigger a label fetch on every
  // keystroke; it only changes once, from null, in the restore effect.
  const [restoredRepoOverride, setRestoredRepoOverride] = useState<string | null>(null);

  // buildOverrides below saves the lists' checked state from these.
  const rowFilterSelection = useRowFilterSelection();
  const authorThreadResolutionSelection = useAuthorThreadResolutionSelection();
  const changeFilterActorSelection = useChangeFilterActorSelection();

  const setValue = useCallback<FilterStateValue['setValue']>(
    (key, value) => {
      store.setValue(key, value);
      setValues((previous) => ({ ...previous, [key]: value }));
    },
    [store],
  );

  // One identity for this Provider's lifetime (the store is created once and
  // setValue is a stable callback) - see FilterFieldStoreContext.
  const fieldStoreValue = useMemo<FilterFieldStoreValue>(
    () => ({
      store,
      actions: {
        getFieldValue: (key) => store.getSnapshot(key),
        setFieldValue: setValue,
      },
    }),
    [store, setValue],
  );

  // Restores saved overrides once, on mount.
  useEffect(() => {
    let cancelled = false;

    const restorePending = (key: string, list: unknown) => {
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

      const mapped: Record<string, unknown> = {};
      Object.entries(FILTER_STATE_FIELD_MAP).forEach(([fieldId, contextKey]) => {
        if (Object.prototype.hasOwnProperty.call(overrides, fieldId)) {
          mapped[contextKey] = overrides[fieldId];
        }
      });

      const changeFilters = asChangeFilters(overrides.changeFilters);
      const mergeCommitRules = asMergeCommitRules(overrides.mergeCommitRules);
      if (mergeCommitRules) {
        mapped.mergeCommitHeadlinePatterns = formatRuleLines(mergeCommitRules.headlinePatterns);
        mapped.mergeCommitLogins = formatRuleLines(mergeCommitRules.logins);
      } else if (changeFilters?.useBuiltinMergePattern === false) {
        // Saved before mergeCommitRules existed: the built-in merge filter
        // was turned off, i.e. no headline counts as a merge. Saved as
        // mergeCommitRules on the next save.
        mapped.mergeCommitHeadlinePatterns = '';
      }
      if (changeFilters) {
        if (Array.isArray(changeFilters.ignoreCommitPatterns)) {
          mapped.changeFilterIgnoreCommitPatterns = formatCommitPatternsForTextarea(
            changeFilters.ignoreCommitPatterns,
          );
        }
      }

      if (Object.keys(mapped).length > 0) {
        store.setMany(mapped);
        setValues((previous) => ({ ...previous, ...mapped }));
      }

      // For when the saved repo differs from the one RepoLabelsProvider's
      // own selectedRepo-driven effect may already have fetched labels for
      // (see that file's comment).
      if (overrides.repo) {
        setRestoredRepoOverride(String(overrides.repo));
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
  }, [store]);

  // Shared by persistRunScriptOptions/persistViewFilterOptions below: the
  // existing overrides updated with the given fields' current values (from
  // valuesRef) and the lists' checked state (from the selection Contexts).
  // A field at its default is removed rather than saved.
  const buildOverrides = useCallback((fieldIds: string[], existingOverrides: UiOptionOverrides) => {
    const defaults = getUiOptionDefaults();
    const overrides: UiOptionOverrides = { ...existingOverrides };
    const includeField = (id: string) => fieldIds.includes(id);
    const currentValues = valuesRef.current;

    const getText = (fieldId: string) => String(currentValues[FILTER_STATE_FIELD_MAP[fieldId] ?? ''] ?? '').trim();
    const getCheckbox = (fieldId: string) => Boolean(currentValues[FILTER_STATE_FIELD_MAP[fieldId] ?? '']);

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

    const setArrayField = (id: string, getSelected: () => string[]) => {
      if (!includeField(id)) return;
      const selected = getSelected();
      if (selected.length > 0) {
        overrides[id] = selected;
      } else {
        delete overrides[id];
      }
    };
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

    // Saved only when they differ from the defaults (an emptied patterns
    // list is kept, as "no headline counts as a merge").
    if (includeField('merge-commit-rules')) {
      const rules: MergeCommitRules = {
        // A missing value is the default (as in NeedsAttentionProvider).
        headlinePatterns: parseRuleLines(
          currentValues.mergeCommitHeadlinePatterns ?? formatRuleLines(DEFAULT_MERGE_COMMIT_RULES.headlinePatterns),
        ),
        logins: parseRuleLines(currentValues.mergeCommitLogins),
      };
      if (
        areListsEqual(rules.headlinePatterns, DEFAULT_MERGE_COMMIT_RULES.headlinePatterns) &&
        areListsEqual(rules.logins, DEFAULT_MERGE_COMMIT_RULES.logins)
      ) {
        delete overrides.mergeCommitRules;
      } else {
        overrides.mergeCommitRules = rules;
      }
    }

    if (
      includeField('change-filter-ignore-comment-authors') ||
      includeField('change-filter-ignore-review-authors') ||
      includeField('change-filter-ignore-commit-patterns')
    ) {
      const changeFilters = { ...asChangeFilters(existingOverrides.changeFilters) };
      // Replaced by mergeCommitRules (converted on restore).
      delete changeFilters.useBuiltinMergePattern;
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
        'merge-commit-rules',
        'change-filter-ignore-comment-authors',
        'change-filter-ignore-review-authors',
        'change-filter-ignore-commit-patterns',
        'filter-custom-comments',
        'filter-other-notes',
        'filter-pr-difficulty',
        'filter-stories',
        'filter-analysis-of-pr',
      ],
      existingOverrides,
    );
    // The two separate Rally filters the Stories filter replaced; their
    // with/without values don't carry over.
    delete overrides['filter-rally-stories'];
    delete overrides['filter-rally-links'];
    await writeUiSessionOverrides(overrides);
  }, [buildOverrides]);

  // Saves the view/filter options 150ms after `values` or any list
  // selection changes, whatever caused the change (a field edit, or a
  // Context-only change such as TableFilterChips' "x" button). This is
  // the only automatic save path for these fields.
  useDebouncedEffect(
    () => {
      persistViewFilterOptions();
    },
    [values, rowFilterSelection, authorThreadResolutionSelection, changeFilterActorSelection],
    150,
  );

  const value: FilterStateValue = { values, setValue, restoredRepoOverride, persistRunScriptOptions };

  return (
    <FilterStateContext.Provider value={value}>
      <FilterFieldStoreContext.Provider value={fieldStoreValue}>{children}</FilterFieldStoreContext.Provider>
    </FilterStateContext.Provider>
  );
}
