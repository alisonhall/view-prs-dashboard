import type { FilterOptionsValue } from '../../state/FilterOptionsContext';
import type { RowFilterListId } from '../../state/RowFilterSelectionContext';
import { normalizeFilterToken } from '../../helpers/pr-filter-label-extraction.helpers.ts';

// The filter bar's fields (UI_REDESIGN_PLAN.md, phase 8): the row filters,
// which choose the rows the table shows. The attention, merge-commit and
// change-detection rules are the Settings drawer's (phase 9b).

export interface RowFilterList {
  listId: RowFilterListId;
  label: string;
  // Checkbox ids are `${idPrefix}-<value>-<index>`.
  idPrefix: string;
  optionsKey: keyof FilterOptionsValue;
  // Where a saved restore leaves the list's selection until its options
  // load (pr-pending-multi-select-selections.helpers.ts).
  pendingKey: string;
  normalizeToken?: (value: unknown) => unknown;
}

export const ROW_FILTER_LISTS: readonly RowFilterList[] = [
  {
    listId: 'label-list',
    label: 'Labels',
    idPrefix: 'label',
    optionsKey: 'labelOptions',
    pendingKey: 'pendingLabelSelections',
    normalizeToken: normalizeFilterToken,
  },
  {
    listId: 'exclude-label-list',
    label: 'Excluded labels',
    idPrefix: 'exclude-label',
    optionsKey: 'excludeLabelOptions',
    pendingKey: 'pendingExcludeLabelSelections',
    normalizeToken: normalizeFilterToken,
  },
  { listId: 'author-list', label: 'Authors', idPrefix: 'author', optionsKey: 'authorOptions', pendingKey: 'pendingAuthorSelections' },
  { listId: 'assigned-list', label: 'Assigned to', idPrefix: 'assigned', optionsKey: 'assignedOptions', pendingKey: 'pendingAssignedSelections' },
  { listId: 'approver-list', label: 'Approved by', idPrefix: 'approver', optionsKey: 'approverOptions', pendingKey: 'pendingApproverSelections' },
];

export interface NotesFilterField {
  id: string;
  // The FilterStateContext key, also the <select>'s name.
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

// "Any (with/without)"-style filters on the user's own notes.
export const NOTES_FILTER_FIELDS: readonly NotesFilterField[] = [
  {
    id: 'filter-custom-comments',
    key: 'filterCustomComments',
    label: 'Custom comments',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With custom comments' },
      { value: 'without', label: 'Without custom comments' },
    ],
  },
  {
    id: 'filter-other-notes',
    key: 'filterOtherNotes',
    label: 'Other notes',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With other notes' },
      { value: 'without', label: 'Without other notes' },
    ],
  },
  {
    id: 'filter-pr-difficulty',
    key: 'filterPrDifficulty',
    label: 'PR difficulty',
    options: [
      { value: '', label: 'Any (set or not set)' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: 'not-set', label: 'Not set' },
    ],
  },
  {
    // A PR matches name-only/url-only/name-and-url when at least one of
    // its stories does (pr-row-match-filters.helpers.ts).
    id: 'filter-stories',
    key: 'filterStories',
    label: 'Stories',
    options: [
      { value: '', label: 'Any' },
      { value: 'none', label: 'Without any story details' },
      { value: 'name-only', label: 'With only story name' },
      { value: 'url-only', label: 'With only story URL' },
      { value: 'name-and-url', label: 'With story and URL' },
    ],
  },
  {
    id: 'filter-analysis-of-pr',
    key: 'filterAnalysisOfPr',
    label: 'Analysis of PR',
    options: [
      { value: '', label: 'Any (with or without)' },
      { value: 'with', label: 'With analysis' },
      { value: 'without', label: 'Without analysis' },
    ],
  },
];
