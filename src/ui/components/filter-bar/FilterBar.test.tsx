/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStateProvider } from '../../state/FilterStateProvider';
import { RowFilterSelectionProvider } from '../../state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from '../../state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from '../../state/ChangeFilterActorSelectionProvider';
import { FilterOptionsContext, type FilterOptionsValue } from '../../state/FilterOptionsContext';
import { useRowFilterSelection } from '../../state/RowFilterSelectionContext';
import { setPendingMultiSelectSelection } from '../../helpers/pr-pending-multi-select-selections.helpers.ts';
import { RowFilterListSeeding } from '../../state/useRowFilterListSeeding';
import { FILTER_BAR_OPEN_STORAGE_KEY, FilterBar, type FilterBarProps } from './FilterBar';

const NO_OPTIONS: FilterOptionsValue = {
  labelOptions: [],
  excludeLabelOptions: [],
  authorOptions: [],
  assignedOptions: [],
  approverOptions: [],
  authorThreadResolutionAllowOptions: [],
  authorThreadResolutionDenyOptions: [],
  changeFilterIgnoreCommentAuthorsOptions: [],
  changeFilterIgnoreReviewAuthorsOptions: [],
};
const withOptions = (patch: Partial<FilterOptionsValue>): FilterOptionsValue => ({ ...NO_OPTIONS, ...patch });
const LABELS = withOptions({
  labelOptions: [
    { value: 'bug', label: 'bug' },
    { value: 'docs', label: 'docs' },
  ],
  authorOptions: [{ value: 'octocat', label: 'The Octocat' }],
});

// What the table's filtering sees: the row-filter selections.
let selection: ReturnType<typeof useRowFilterSelection> | null = null;
function SelectionProbe() {
  selection = useRowFilterSelection();
  return null;
}

const tree = (
  options: FilterOptionsValue,
  props: Partial<FilterBarProps>,
  initialValues: Record<string, unknown> = {},
  seeding = true,
): ReactNode => (
  <RowFilterSelectionProvider>
    <AuthorThreadResolutionSelectionProvider>
      <ChangeFilterActorSelectionProvider>
        <FilterStateProvider initialValues={{ scopeMode: 'all', filterPrNumbers: '', alwaysShowInReview: false, filterStories: '', ...initialValues }}>
          <FilterOptionsContext.Provider value={options}>
            <SelectionProbe />
            {seeding && <RowFilterListSeeding />}
            <FilterBar shownCount={3} totalCount={5} loaded {...props} />
          </FilterOptionsContext.Provider>
        </FilterStateProvider>
      </ChangeFilterActorSelectionProvider>
    </AuthorThreadResolutionSelectionProvider>
  </RowFilterSelectionProvider>
);

const renderBar = (options: FilterOptionsValue = LABELS, props: Partial<FilterBarProps> = {}, initialValues: Record<string, unknown> = {}) => {
  const result = render(tree(options, props, initialValues));
  return { ...result, rerenderWith: (next: FilterOptionsValue) => result.rerender(tree(next, props, initialValues)) };
};

const toggle = () => screen.getByRole('button', { name: /^Filters/ });
const checked = (listId: 'label-list' | 'author-list') => Array.from(selection?.checkedByListId[listId] ?? []);

beforeEach(() => {
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>).viewPrsPendingMultiSelectSelections;
  selection = null;
});

describe('FilterBar header', () => {
  test('starts closed, with the count of rows shown', () => {
    renderBar();
    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'View scope' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 5 PRs')).toBeInTheDocument();
  });

  test('says "PR" for one, and "Loading…" before the first data load', () => {
    const { unmount } = renderBar(LABELS, { shownCount: 1, totalCount: 1 });
    expect(screen.getByText('Showing 1 of 1 PR')).toBeInTheDocument();
    unmount();
    renderBar(LABELS, { loaded: false });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  test('opens and closes, and remembers which it was left', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBar();
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'View scope' })).toBeVisible();
    expect(window.localStorage.getItem(FILTER_BAR_OPEN_STORAGE_KEY)).toBe('true');

    unmount();
    renderBar();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle());
    expect(window.localStorage.getItem(FILTER_BAR_OPEN_STORAGE_KEY)).toBe('false');
  });

  test('still works when the browser blocks storage', async () => {
    const user = userEvent.setup();
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderBar();
      await user.click(toggle());
      expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  test('shows a removable chip per applied filter, how many on the button, and "Clear all"', async () => {
    const user = userEvent.setup();
    renderBar(LABELS, {}, { scopeMode: 'last-run', filterStories: 'none' });
    const chips = screen.getByRole('group', { name: 'Applied table filters' });
    expect(within(chips).getAllByRole('button', { name: /^Remove filter: / })).toHaveLength(2);
    expect(toggle()).toHaveAccessibleName('Filters, 2 applied');

    await user.click(within(chips).getAllByRole('button', { name: /^Remove filter: / })[0]!);
    expect(toggle()).toHaveAccessibleName('Filters, 1 applied');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('group', { name: 'Applied table filters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    expect(toggle()).toHaveAccessibleName('Filters');
  });
});

describe('FilterBar panel', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(toggle());

  test('groups its controls: rows, labels and people, your notes', async () => {
    const user = userEvent.setup();
    renderBar();
    await open(user);
    const rows = screen.getByRole('group', { name: 'Rows' });
    expect(within(rows).getByRole('combobox', { name: 'View scope' })).toBeInTheDocument();
    expect(within(rows).getByRole('textbox', { name: 'PR numbers' })).toBeInTheDocument();
    expect(within(rows).getByRole('checkbox', { name: 'Always show PRs in review' })).toBeInTheDocument();
    const people = screen.getByRole('group', { name: 'Labels and people' });
    ['Labels', 'Excluded labels', 'Authors', 'Assigned to', 'Approved by'].forEach((name) => {
      expect(within(people).getByRole('group', { name })).toHaveClass('multi-select-list');
    });
    const notes = screen.getByRole('group', { name: 'Your notes' });
    expect(within(notes).getAllByRole('combobox').map((select) => select.getAttribute('id'))).toEqual([
      'filter-custom-comments',
      'filter-other-notes',
      'filter-pr-difficulty',
      'filter-stories',
      'filter-analysis-of-pr',
    ]);
  });

  test('a list\'s checkboxes set the selection the table filters by, and its summary counts them', async () => {
    const user = userEvent.setup();
    renderBar();
    await open(user);
    const labels = screen.getByRole('group', { name: 'Labels' });
    const summary = labels.closest('details')?.querySelector('summary') as HTMLElement;
    expect(summary).toHaveTextContent(/^Labels$/);
    await user.click(summary);
    await user.click(within(labels).getByRole('checkbox', { name: 'docs' }));
    expect(checked('label-list')).toEqual(['docs']);
    expect(summary).toHaveTextContent('Labels1 selected');
    // Its chip appears in the header.
    expect(within(screen.getByRole('group', { name: 'Applied table filters' })).getByText(/docs/)).toBeInTheDocument();
  });

  test('a list with no options says so', async () => {
    const user = userEvent.setup();
    renderBar();
    await open(user);
    expect(screen.getByRole('group', { name: 'Approved by' })).toHaveTextContent('No options');
  });
});

describe('FilterBar list selections (RowFilterListSeeding, mounted beside it)', () => {
  test('the bar itself does no seeding: a saved selection waits for RowFilterListSeeding', () => {
    act(() => setPendingMultiSelectSelection('pendingLabelSelections', ['docs']));
    render(tree(LABELS, {}, {}, false));
    expect(checked('label-list')).toEqual([]);
  });

  test('a saved selection waits for its options, then applies (closed or open)', () => {
    act(() => setPendingMultiSelectSelection('pendingLabelSelections', ['Docs']));
    const { rerenderWith } = renderBar(NO_OPTIONS);
    expect(checked('label-list')).toEqual([]);
    rerenderWith(LABELS);
    // Labels match case-insensitively.
    expect(checked('label-list')).toEqual(['docs']);
  });

  test('options rebuilt the same (every data poll) leave the selection as it was, so nothing re-filters or re-saves', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderBar();
    await user.click(toggle());
    await user.click(within(screen.getByRole('group', { name: 'Authors' })).getByRole('checkbox', { name: 'The Octocat' }));
    const before = selection?.checkedByListId;
    rerenderWith(JSON.parse(JSON.stringify(LABELS)) as FilterOptionsValue);
    expect(selection?.checkedByListId).toBe(before);
  });

  test('a picked value no longer among the options is dropped', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderBar();
    await user.click(toggle());
    await user.click(within(screen.getByRole('group', { name: 'Authors' })).getByRole('checkbox', { name: 'The Octocat' }));
    expect(checked('author-list')).toEqual(['octocat']);
    rerenderWith(withOptions({ labelOptions: LABELS.labelOptions }));
    expect(checked('author-list')).toEqual([]);
  });
});
