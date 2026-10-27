/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStateProvider } from '../../state/FilterStateProvider';
import { RowFilterSelectionProvider } from '../../state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from '../../state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from '../../state/ChangeFilterActorSelectionProvider';
import { useFilterState } from '../../state/FilterStateContext';
import { useAuthorThreadResolutionSelection } from '../../state/AuthorThreadResolutionSelectionContext';
import { useChangeFilterActorSelection } from '../../state/ChangeFilterActorSelectionContext';
import { FilterOptionsContext, type FilterOptionsValue } from '../../state/FilterOptionsContext';
import { ListSelectionSeeding } from '../../state/useListSelectionSeeding';
import { buildFilterStateInitialValues } from '../../state/filterStateInitialValues';
import { setPendingMultiSelectSelection } from '../../helpers/pr-pending-multi-select-selections.helpers.ts';
import { AttentionRulesSection } from './AttentionRulesSection';
import { ChangeDetectionSection } from './ChangeDetectionSection';
import { MergeCommitsSection } from './MergeCommitsSection';

const ACTORS = [
  { value: 'bob', label: 'Bob' },
  { value: 'dependabot[bot]', label: 'dependabot[bot]' },
];
const OPTIONS: FilterOptionsValue = {
  labelOptions: [],
  excludeLabelOptions: [],
  authorOptions: [],
  assignedOptions: [],
  approverOptions: [],
  authorThreadResolutionAllowOptions: ACTORS,
  authorThreadResolutionDenyOptions: ACTORS,
  changeFilterIgnoreCommentAuthorsOptions: ACTORS,
  changeFilterIgnoreReviewAuthorsOptions: ACTORS,
};

let state: {
  values: Record<string, unknown>;
  thread: ReturnType<typeof useAuthorThreadResolutionSelection>;
  change: ReturnType<typeof useChangeFilterActorSelection>;
};
function Probe() {
  state = { values: useFilterState().values, thread: useAuthorThreadResolutionSelection(), change: useChangeFilterActorSelection() };
  return null;
}

const renderWith = (ui: ReactNode, options: FilterOptionsValue = OPTIONS) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={buildFilterStateInitialValues()}>
            <FilterOptionsContext.Provider value={options}>
              <Probe />
              <ListSelectionSeeding />
              {ui}
            </FilterOptionsContext.Provider>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

const picked = (selection: { checkedByListId: Partial<Record<string, Set<string>>> }, listId: string) => Array.from(selection.checkedByListId[listId] ?? []);

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).viewPrsPendingMultiSelectSelections;
});

describe('AttentionRulesSection', () => {
  test('the toggles start at their defaults and set their keys', async () => {
    const user = userEvent.setup();
    renderWith(<AttentionRulesSection />);
    expect(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' })).toHaveValue('all');
    expect(screen.getByRole('checkbox', { name: 'Mark PRs with my pending (unsubmitted) comments' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Apply NO_ACTIVITY attention rules to draft PRs' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Mark PRs with my pending (unsubmitted) comments' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' }), 'none');
    expect(state.values).toMatchObject({ attentionIncludePendingComments: false, attentionNoActivityMode: 'none' });
  });

  test('the thread starters list shows for the policy that uses it; the other keeps its picks, hidden', async () => {
    const user = userEvent.setup();
    renderWith(<AttentionRulesSection />);
    const policy = screen.getByRole('combobox', { name: 'PR author thread resolution policy' });
    const allowName = 'Allow PR authors to resolve threads started by (Actor Names)';
    const denyName = 'Do not allow PR authors to resolve threads started by (Actor Names)';
    expect(screen.queryByRole('group', { name: allowName })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: denyName })).not.toBeInTheDocument();

    await user.selectOptions(policy, 'allow-only');
    const allow = screen.getByRole('group', { name: allowName });
    await user.click(within(allow).getByRole('checkbox', { name: 'Bob' }));
    expect(picked(state.thread, 'attention-author-thread-resolution-allow-list')).toEqual(['bob']);

    await user.selectOptions(policy, 'deny-only');
    expect(screen.queryByRole('group', { name: allowName })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: denyName })).toBeInTheDocument();
    expect(picked(state.thread, 'attention-author-thread-resolution-allow-list')).toEqual(['bob']);
  });
});

describe('ChangeDetectionSection', () => {
  test('its author lists set ChangeFilterActorSelection; the commit patterns their key', async () => {
    const user = userEvent.setup();
    renderWith(<ChangeDetectionSection />);
    const comments = screen.getByRole('group', { name: 'Ignore comments from these authors (GitHub logins)' });
    await user.click(within(comments).getByRole('checkbox', { name: 'dependabot[bot]' }));
    expect(picked(state.change, 'change-filter-ignore-comment-authors-list')).toEqual(['dependabot[bot]']);
    const summary = comments.closest('details')?.querySelector('summary');
    expect(summary).toHaveTextContent('1 selected');

    await user.type(screen.getByRole('textbox', { name: 'Ignore commits matching patterns (regex, one per line)' }), '^docs:');
    expect(state.values.changeFilterIgnoreCommitPatterns).toBe('^docs:');
  });

  test('a list without options says so', () => {
    renderWith(<ChangeDetectionSection />, { ...OPTIONS, changeFilterIgnoreReviewAuthorsOptions: [] });
    expect(screen.getByRole('group', { name: 'Ignore reviews from these authors (GitHub logins)' })).toHaveTextContent('No options');
  });
});

describe('MergeCommitsSection', () => {
  test('both lists are labelled; the headline patterns start at the default and name invalid ones', async () => {
    const user = userEvent.setup();
    renderWith(<MergeCommitsSection />);
    const patterns = screen.getByRole('textbox', { name: 'Headline patterns (regular expressions, one per line, not case-sensitive)' });
    expect(patterns).toHaveValue('^Merge\\b');
    expect(screen.getByRole('textbox', { name: 'Logins whose commits always count as merges (one per line)' })).toHaveValue('');
    await user.type(patterns, '{Enter}(');
    expect(screen.getByRole('status')).toHaveTextContent('Skipped, not a valid regular expression: "("');
  });
});

describe('ListSelectionSeeding, for the rule lists', () => {
  const tree = (ui: ReactNode, options: FilterOptionsValue) => (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={buildFilterStateInitialValues()}>
            <FilterOptionsContext.Provider value={options}>
              <Probe />
              <ListSelectionSeeding />
              {ui}
            </FilterOptionsContext.Provider>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );

  test('saved picks apply at once, even a login the data has no actor for, and stay through an options change', () => {
    act(() => {
      setPendingMultiSelectSelection('pendingAuthorThreadResolutionDenySelections', ['bob', 'renovate[bot]']);
      setPendingMultiSelectSelection('pendingChangeFilterIgnoreReviewAuthors', ['dependabot[bot]']);
    });
    const empty = { ...OPTIONS, authorThreadResolutionDenyOptions: [], changeFilterIgnoreReviewAuthorsOptions: [] };
    const { rerender } = render(tree(null, empty));
    expect(picked(state.thread, 'attention-author-thread-resolution-deny-list')).toEqual(['bob', 'renovate[bot]']);
    expect(picked(state.change, 'change-filter-ignore-review-authors-list')).toEqual(['dependabot[bot]']);

    rerender(tree(null, OPTIONS));
    expect(picked(state.thread, 'attention-author-thread-resolution-deny-list')).toEqual(['bob', 'renovate[bot]']);
    expect(picked(state.change, 'change-filter-ignore-review-authors-list')).toEqual(['dependabot[bot]']);
  });

  test('a login picked before the saved list loads is kept alongside the saved picks', () => {
    render(tree(null, OPTIONS));
    act(() => state.thread.setChecked('attention-author-thread-resolution-deny-list', ['dependabot[bot]']));

    act(() => {
      setPendingMultiSelectSelection('pendingAuthorThreadResolutionDenySelections', ['bob', 'renovate[bot]']);
    });
    expect(picked(state.thread, 'attention-author-thread-resolution-deny-list')).toEqual(['bob', 'renovate[bot]', 'dependabot[bot]']);
  });

  test('a pick the data has no actor for is listed by its login, and unchecking it drops it', async () => {
    const user = userEvent.setup();
    act(() => {
      setPendingMultiSelectSelection('pendingChangeFilterIgnoreCommentAuthors', ['renovate[bot]']);
    });
    renderWith(<ChangeDetectionSection />);
    const comments = screen.getByRole('group', { name: 'Ignore comments from these authors (GitHub logins)' });
    expect(within(comments).getAllByRole('checkbox').map((box) => box.closest('div')?.textContent)).toEqual(['Bob', 'dependabot[bot]', 'renovate[bot]']);
    expect(within(comments).getByRole('checkbox', { name: 'renovate[bot]' })).toBeChecked();

    await user.click(within(comments).getByRole('checkbox', { name: 'renovate[bot]' }));
    expect(picked(state.change, 'change-filter-ignore-comment-authors-list')).toEqual([]);
    expect(within(comments).queryByRole('checkbox', { name: 'renovate[bot]' })).not.toBeInTheDocument();
  });
});
