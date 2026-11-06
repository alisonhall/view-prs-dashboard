/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterStateProvider } from '../../state/FilterStateProvider';
import { RowFilterSelectionProvider } from '../../state/RowFilterSelectionProvider';
import { AuthorThreadResolutionSelectionProvider } from '../../state/AuthorThreadResolutionSelectionProvider';
import { ChangeFilterActorSelectionProvider } from '../../state/ChangeFilterActorSelectionProvider';
import { FilterOptionsContext, type FilterOptionsValue } from '../../state/FilterOptionsContext';
import { useRowFilterSelection } from '../../state/RowFilterSelectionContext';
import { ListSelectionSeeding } from '../../state/useListSelectionSeeding';
import { FilterBar } from './FilterBar';

const OPTIONS: FilterOptionsValue = {
  labelOptions: [{ value: 'bug', label: 'bug' }],
  excludeLabelOptions: [],
  authorOptions: [{ value: 'octocat', label: 'The Octocat' }],
  assignedOptions: [],
  approverOptions: [],
  authorThreadResolutionAllowOptions: [],
  authorThreadResolutionDenyOptions: [],
  changeFilterIgnoreCommentAuthorsOptions: [],
  changeFilterIgnoreReviewAuthorsOptions: [],
};

// The user defaults the server keeps: GET returns them, PUT replaces them.
let saved: Record<string, unknown> = {};
const puts: Record<string, unknown>[] = [];
let readsFail = false;
const fetchMock = jest.fn(async (_input: unknown, init?: { method?: string; body?: string }) => {
  if (readsFail && init?.method !== 'PUT') return { ok: false, json: async () => ({}) };
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body));
    puts.push(saved);
    return { ok: true, json: async () => ({}) };
  }
  return { ok: true, json: async () => ({ overrides: saved }) };
});

let selection: ReturnType<typeof useRowFilterSelection> | null = null;
function SelectionProbe() {
  selection = useRowFilterSelection();
  return null;
}

const renderBar = () =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ onlyNeedsAttention: false, onlyWaitingOnMe: false, onlyThreadsToCheck: false, filterPrNumbers: '', filterSearch: '' }}>
            <FilterOptionsContext.Provider value={OPTIONS}>
              <SelectionProbe />
              <ListSelectionSeeding />
              <FilterBar shownCount={3} totalCount={5} loaded />
            </FilterOptionsContext.Provider>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

const viewsGroup = () => screen.getByRole('group', { name: 'Saved views' });
const viewChip = (name: string | RegExp) => within(viewsGroup()).getByRole('button', { name });
const savedViews = () => (saved.savedFilterViews as { views: Array<{ name: string; filters: unknown }> } | undefined)?.views;

beforeEach(() => {
  saved = {};
  puts.length = 0;
  readsFail = false;
  fetchMock.mockClear();
  selection = null;
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>).viewPrsPendingMultiSelectSelections;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
});

describe('saved filter views', () => {
  test('before any is saved, starter views are offered; one click applies one, and the pressed one clears it', async () => {
    const user = userEvent.setup();
    renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    expect(within(viewsGroup()).getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      'Needs attention',
      'Waiting on me',
      'Resolved for you to check',
    ]);

    await user.click(viewChip('Waiting on me'));
    expect(viewChip('Waiting on me')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Waiting on me', hidden: true })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Applied table filters' })).toHaveTextContent('Waiting on me');

    await user.click(viewChip('Waiting on me'));
    expect(viewChip('Waiting on me')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('group', { name: 'Applied table filters' })).not.toBeInTheDocument();
    // Applying views doesn't save the views themselves.
    expect(savedViews()).toBeUndefined();
  });

  test('applying a view sets every filter to its own: lists, search and fields, clearing the rest', async () => {
    const user = userEvent.setup();
    saved = {
      savedFilterViews: {
        views: [{ id: 'mine', name: 'Octocat bugs', filters: { fields: { filterSearch: 'parser' }, lists: { 'author-list': ['octocat'], 'label-list': ['bug'] } } }],
      },
    };
    renderBar();
    await waitFor(() => expect(viewChip('Octocat bugs')).toBeInTheDocument());
    // A filter the view doesn't have: cleared when it's applied.
    await user.click(screen.getByRole('checkbox', { name: 'Waiting on me', hidden: true }));

    await user.click(viewChip('Octocat bugs'));
    expect(selection?.checkedByListId['author-list']).toEqual(new Set(['octocat']));
    expect(selection?.checkedByListId['label-list']).toEqual(new Set(['bug']));
    expect(screen.getByRole('searchbox')).toHaveValue('parser');
    expect(screen.getByRole('checkbox', { name: 'Waiting on me', hidden: true })).not.toBeChecked();
    expect(viewChip('Octocat bugs')).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Save as view" names the applied filters and saves them with the user defaults, keeping the other settings', async () => {
    const user = userEvent.setup();
    saved = { repo: 'acme/api', savedFilterViews: { views: [] } };
    renderBar();
    // No views and no filters: nothing to show.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Save as view' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Only PRs that need attention', hidden: true }));
    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new view' }), 'Triage{Enter}');

    expect(viewChip('Triage')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Save as view' })).not.toBeInTheDocument();
    await waitFor(() => expect(savedViews()).toEqual([expect.objectContaining({ name: 'Triage' })]));
    expect(saved.repo).toBe('acme/api');
    expect(savedViews()?.[0]?.filters).toMatchObject({ fields: { onlyNeedsAttention: true }, lists: { 'author-list': [] } });
  });

  test("a name another view has can't be saved; Esc cancels", async () => {
    const user = userEvent.setup();
    renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Open conversations with me', hidden: true }));
    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    const name = screen.getByRole('textbox', { name: 'Name for the new view' });
    await user.type(name, 'needs ATTENTION');
    expect(screen.getByText('Another view has that name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Name for the new view' })).not.toBeInTheDocument();
    expect(savedViews()).toBeUndefined();
  });

  test('a filter changed after applying a view marks it modified, and Update saves the change into it', async () => {
    const user = userEvent.setup();
    renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    await user.click(viewChip('Needs attention'));
    await user.click(screen.getByRole('checkbox', { name: 'Waiting on me', hidden: true }));

    expect(viewChip('Needs attention (modified)')).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Update “Needs attention”' }));
    expect(viewChip('Needs attention')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(savedViews()?.[0]).toMatchObject({ name: 'Needs attention', filters: { fields: { onlyNeedsAttention: true, onlyWaitingOnMe: true } } }),
    );
    // The other starter views are saved as they were.
    expect(savedViews()?.map((view) => view.name)).toEqual(['Needs attention', 'Waiting on me', 'Resolved for you to check']);
  });

  test('the panel renames and deletes views; deleting them all keeps none, not the starters', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const manager = screen.getByRole('group', { name: 'Manage saved views' });

    await user.click(within(manager).getByRole('button', { name: 'Rename Waiting on me' }));
    const name = within(manager).getByRole('textbox', { name: 'New name for Waiting on me' });
    await user.clear(name);
    await user.type(name, 'On me{Enter}');
    expect(viewChip('On me')).toBeInTheDocument();

    for (const view of ['Needs attention', 'On me', 'Resolved for you to check']) {
      await user.click(within(manager).getByRole('button', { name: `Delete ${view}` }));
    }
    expect(within(manager).getByText(/None yet/)).toBeInTheDocument();
    await waitFor(() => expect(saved.savedFilterViews).toEqual({ views: [] }));

    unmount();
    const before = fetchMock.mock.calls.length;
    renderBar();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {});
    expect(screen.queryByRole('group', { name: 'Saved views' })).not.toBeInTheDocument();
  });
  test("a change made in another browser isn't lost: each change applies to the views as saved, and focus re-reads them", async () => {
    const user = userEvent.setup();
    saved = { savedFilterViews: { views: [{ id: 'a', name: 'Mine', filters: { fields: { onlyWaitingOnMe: true } } }] } };
    renderBar();
    await waitFor(() => expect(viewChip('Mine')).toBeInTheDocument());

    // Another browser adds a view after this page read them.
    saved = { savedFilterViews: { views: [...(savedViews() || []), { id: 'b', name: 'Theirs', filters: { fields: { onlyThreadsToCheck: true } } }] } };
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const manager = screen.getByRole('group', { name: 'Manage saved views' });
    await user.click(within(manager).getByRole('button', { name: 'Rename Mine' }));
    await user.type(within(manager).getByRole('textbox', { name: 'New name for Mine' }), ' too{Enter}');

    await waitFor(() => expect(savedViews()?.map((view) => view.name)).toEqual(['Mine too', 'Theirs']));
    expect(viewChip('Theirs')).toBeInTheDocument();

    // And one deleted there shows as gone once this window has focus again.
    saved = { savedFilterViews: { views: (savedViews() || []).filter((view) => view.name !== 'Theirs') } };
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(within(viewsGroup()).queryByRole('button', { name: 'Theirs' })).not.toBeInTheDocument());
  });

  test('"(modified)" goes once no filter is applied', async () => {
    const user = userEvent.setup();
    renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    await user.click(viewChip('Needs attention'));
    await user.click(screen.getByRole('checkbox', { name: 'Waiting on me', hidden: true }));
    expect(viewChip('Needs attention (modified)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(viewChip('Needs attention')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/modified/)).not.toBeInTheDocument();
  });

  test("while the user defaults can't be read, no views show (one saved then would be lost)", async () => {
    readsFail = true;
    renderBar();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('group', { name: 'Saved views' })).not.toBeInTheDocument();
  });

  test('focus goes to the new view after Save, back to Save as view after Cancel, and back to Rename after a rename', async () => {
    const user = userEvent.setup();
    renderBar();
    await waitFor(() => expect(viewChip('Needs attention')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Open conversations with me', hidden: true }));

    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Save as view' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for the new view' }), 'Talks{Enter}');
    expect(viewChip('Talks')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const manager = screen.getByRole('group', { name: 'Manage saved views' });
    await user.click(within(manager).getByRole('button', { name: 'Rename Talks' }));
    await user.keyboard('{Escape}');
    expect(within(manager).getByRole('button', { name: 'Rename Talks' })).toHaveFocus();
  });
});
