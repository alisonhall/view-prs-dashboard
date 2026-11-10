/** @jest-environment jsdom */

import { useEffect, type ReactNode } from 'react';
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
import { ATTENTION_CHECKBOX_FIELDS } from './settings-fields';
import { RulesScopeProvider } from '../../state/RulesScopeContext';
import { ActorIdentityContext, defaultActorIdentity } from '../../state/ActorIdentityContext';

const ACTORS = [
  { value: 'bob', label: 'Bob' },
  { value: 'dependabot[bot]', label: 'dependabot[bot]' },
];
const OPTIONS: FilterOptionsValue = {
  repoOptions: [],
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
              <RulesScopeProvider>{ui}</RulesScopeProvider>
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

  test('every rule says what it does, as its description', () => {
    renderWith(<AttentionRulesSection />);
    expect(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' })).toHaveAccessibleDescription(/had no activity on yet/);
    for (const field of ATTENTION_CHECKBOX_FIELDS) {
      expect(screen.getByRole('checkbox', { name: field.label })).toHaveAccessibleDescription(field.hint as string);
    }
  });

  test('the thread starters list shows for the policy that uses it; the other keeps its picks, hidden', async () => {
    const user = userEvent.setup();
    renderWith(<AttentionRulesSection />);
    const policy = screen.getByRole('combobox', { name: 'PR author thread resolution policy' });
    const allowName = 'Allow PR authors to resolve threads started by';
    const denyName = 'Do not allow PR authors to resolve threads started by';
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

// Settings › Rules for a repo (repo-rules.helpers.ts, RepoRulesScope.tsx).
describe('rules for one repo', () => {
  const WITH_REPOS: FilterOptionsValue = { ...OPTIONS, repoOptions: [{ value: 'acme/api', label: 'acme/api' }, { value: 'acme/web', label: 'acme/web' }] };
  const rulesFor = () => screen.getByRole('combobox', { name: 'Rules for' });

  test('a repo follows every repo\'s rules (shown, not editable) until it\'s given its own; editing those leaves every repo\'s alone', async () => {
    const user = userEvent.setup();
    renderWith(<AttentionRulesSection />, WITH_REPOS);
    expect(rulesFor()).toHaveValue('');
    expect(screen.getAllByText('Can differ per repo')).toHaveLength(2);

    await user.selectOptions(rulesFor(), 'acme/api');
    const noActivity = screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' });
    // One for each group here that can differ: the attention rules and thread resolution.
    expect(screen.getAllByText('acme/api follows the rules for every repo (shown).')).toHaveLength(2);
    expect(noActivity).toBeDisabled();
    expect(noActivity).toHaveValue('all');

    await user.click(screen.getAllByRole('button', { name: 'Give acme/api its own' })[0]!);
    expect(noActivity).toBeEnabled();
    await user.selectOptions(noActivity, 'none');
    await user.click(screen.getByRole('checkbox', { name: 'Apply NO_ACTIVITY attention rules to draft PRs' }));
    expect(state.values.attentionNoActivityMode).toBe('all');
    expect(state.values.attentionIncludeDraftNoActivity).toBe(false);
    expect((state.values.repoRules as Record<string, { attention: Record<string, unknown> }>)['acme/api']!.attention).toMatchObject({
      noActivityMode: 'none',
      includeDraftNoActivity: true,
    });

    // Back on every repo's rules: theirs, and which repos have their own.
    await user.selectOptions(rulesFor(), '');
    expect(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' })).toHaveValue('all');
    expect(screen.getByText('Can differ per repo · acme/api has its own')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'acme/api (has its own rules)' })).toBeInTheDocument();

    await user.selectOptions(rulesFor(), 'acme/api');
    expect(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' })).toHaveValue('none');
    await user.click(screen.getByRole('button', { name: 'Use the rules for every repo' }));
    expect(state.values.repoRules).toEqual({});
    expect(screen.getByRole('combobox', { name: 'NO_ACTIVITY handling' })).toBeDisabled();
  });

  // Settings › People: someone merged into another person is them. Every
  // repo's picks follow by the lists' seeding; a repo's own here.
  test("a repo's own thread pick of someone since merged into another person shows, and unpicks, as that person", async () => {
    const user = userEvent.setup();
    const identity = {
      ...defaultActorIdentity,
      normalizeActorLogin: (value: unknown) => (value === 'actor:bob-old' ? 'actor:bob' : String(value ?? '')),
    };
    function SeedRules() {
      const { setValue } = useFilterState();
      useEffect(() => {
        setValue('repoRules', { 'acme/api': { threadResolution: { mode: 'allow-only', allow: ['actor:bob-old'], deny: [] } } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    const people = [{ value: 'actor:bob', label: 'Bob' }];
    renderWith(
      <ActorIdentityContext.Provider value={identity}>
        <SeedRules />
        <AttentionRulesSection />
      </ActorIdentityContext.Provider>,
      { ...WITH_REPOS, authorThreadResolutionAllowOptions: people, authorThreadResolutionDenyOptions: people },
    );
    await user.selectOptions(rulesFor(), 'acme/api');
    const allow = screen.getByRole('group', { name: 'Allow PR authors to resolve threads started by' });
    const bob = within(allow).getByRole('checkbox', { name: 'Bob' });
    expect(bob).toBeChecked();
    await user.click(bob);
    expect((state.values.repoRules as Record<string, { threadResolution: { allow: string[] } }>)['acme/api']!.threadResolution.allow).toEqual([]);
  });

  // A repo no longer followed (no stored PRs) can still have rules of its own.
  test('a repo with rules but no PRs is listed, and stays picked once its rules are taken away', async () => {
    const user = userEvent.setup();
    function SeedRules() {
      const { setValue } = useFilterState();
      useEffect(() => {
        setValue('repoRules', { 'gone/repo': { ignoreCommitPatterns: ['^docs:'] } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    renderWith(
      <>
        <SeedRules />
        <ChangeDetectionSection />
      </>,
      WITH_REPOS,
    );
    await user.selectOptions(rulesFor(), 'gone/repo');
    await user.click(screen.getByRole('button', { name: 'Use the rules for every repo' }));
    expect(state.values.repoRules).toEqual({});
    expect(rulesFor()).toHaveValue('gone/repo');
    expect(screen.getByText('gone/repo follows the rules for every repo (shown).')).toBeInTheDocument();
  });

  // The drawer keeps every section in the page: three pickers, one choice.
  test('each section has its own "Rules for", with ids of its own, all on the same repo', async () => {
    const user = userEvent.setup();
    renderWith(
      <>
        <AttentionRulesSection />
        <ChangeDetectionSection />
        <MergeCommitsSection />
      </>,
      WITH_REPOS,
    );
    const pickers = screen.getAllByRole('combobox', { name: 'Rules for' });
    expect(pickers).toHaveLength(3);
    expect(new Set(pickers.map((picker) => picker.id)).size).toBe(3);
    await user.selectOptions(pickers[1]!, 'acme/web');
    expect(pickers.map((picker) => (picker as HTMLSelectElement).value)).toEqual(['acme/web', 'acme/web', 'acme/web']);
  });

  test("a repo's own thread rules start as every repo's, and their lists are its own picks", async () => {
    const user = userEvent.setup();
    renderWith(<AttentionRulesSection />, WITH_REPOS);
    await user.selectOptions(rulesFor(), 'acme/api');
    const buttons = screen.getAllByRole('button', { name: 'Give acme/api its own' });
    await user.click(buttons[buttons.length - 1]!);
    await user.selectOptions(screen.getByRole('combobox', { name: 'PR author thread resolution policy' }), 'allow-only');
    await user.click(within(screen.getByRole('group', { name: 'Allow PR authors to resolve threads started by' })).getByRole('checkbox', { name: 'Bob' }));

    expect((state.values.repoRules as Record<string, { threadResolution: unknown }>)['acme/api']!.threadResolution).toEqual({
      mode: 'allow-only',
      allow: ['bob'],
      deny: [],
    });
    expect(state.values.attentionAuthorThreadResolutionMode).toBe('allow-all');
    expect(picked(state.thread, 'attention-author-thread-resolution-allow-list')).toEqual([]);
  });

  test("the commit patterns can be a repo's own; the people lists say they're the same for every repo", async () => {
    const user = userEvent.setup();
    renderWith(<ChangeDetectionSection />, WITH_REPOS);
    await user.selectOptions(rulesFor(), 'acme/web');
    expect(screen.getByText(/The same for every repo/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Give acme/web its own' }));
    await user.type(screen.getByRole('textbox', { name: /Ignore commits matching patterns/ }), '^chore\\(release\\)');
    expect(state.values.changeFilterIgnoreCommitPatterns).toBe('');
    expect((state.values.repoRules as Record<string, { ignoreCommitPatterns: string[] }>)['acme/web']!.ignoreCommitPatterns).toEqual([
      '^chore\\(release\\)',
    ]);
  });

  test("the merge headline patterns can be a repo's own, starting as every repo's; the logins are the same for every repo", async () => {
    const user = userEvent.setup();
    renderWith(<MergeCommitsSection />, WITH_REPOS);
    await user.selectOptions(rulesFor(), 'acme/api');
    await user.click(screen.getByRole('button', { name: 'Give acme/api its own' }));
    const patterns = screen.getByRole('textbox', { name: /Headline patterns/ });
    expect(patterns).toHaveValue('^Merge\\b');
    await user.clear(patterns);
    await user.type(patterns, '^Sync');
    expect(state.values.mergeCommitHeadlinePatterns).toBe('^Merge\\b');
    expect((state.values.repoRules as Record<string, { mergeCommitHeadlinePatterns: string[] }>)['acme/api']!.mergeCommitHeadlinePatterns).toEqual(['^Sync']);
    expect(screen.getByRole('textbox', { name: /Logins whose commits always count as merges/ })).toBeEnabled();
    expect(screen.getByText(/The same for every repo/)).toBeInTheDocument();
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
              <RulesScopeProvider>{ui}</RulesScopeProvider>
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
