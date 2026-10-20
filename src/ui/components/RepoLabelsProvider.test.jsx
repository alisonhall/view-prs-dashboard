/** @jest-environment jsdom */

const { render, screen, act, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { RepoLabelsProvider } = require('./RepoLabelsProvider');
const { ApplyLabelSelect } = require('./ApplyLabelSelect');
const { PrActionsCell } = require('./cells/PrActionsCell');
const { PrDataProvider } = require('../state/PrDataProvider');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');
const { useRepoLabels } = require('../state/RepoLabelsContext');

// Cleanup pass (prompted by a direct question about why
// window.refreshAvailableRepoLabels stayed vanilla instead of being fully
// migrated, then a direct instruction to reconsider the structure so NO
// window.* bridge is needed at all, see REACT_MIGRATION_PLAN.md):
// RepoLabelsProvider owns the real fetch (GET /view-prs/labels) itself, as
// real React state - every mount below needs a real <FilterStateProvider>
// ancestor now (RepoLabelsProvider reads values.repo/restoredRepoOverride
// via useFilterState(), which throws without one), which itself needs the
// 3 selection-Context ancestors FilterStateProvider's own buildOverrides()
// requires - same wrapper shape FilterStateProvider.test.jsx already
// establishes. FilterStateProvider's own restore-on-mount effect also
// calls fetch (GET /view-prs/user-defaults) unconditionally, so every mock
// below branches by URL, and every count/absence assertion filters to the
// /view-prs/labels calls specifically rather than asserting on `fetch` as
// a whole.
function TestProviders({ initialSelectedRepo, initialFilterValues = {}, children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ repo: '', ...initialFilterValues }}>
            <PrDataProvider initialSelectedRepo={initialSelectedRepo}>
              <RepoLabelsProvider>{children}</RepoLabelsProvider>
            </PrDataProvider>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}

function TestRefreshButton({ repoOverride }) {
  const { refresh } = useRepoLabels();
  return (
    <button type="button" onClick={() => refresh(repoOverride)}>
      refresh
    </button>
  );
}

const mockFetch = (labels, userDefaultsOverrides = {}) => {
  global.fetch = jest.fn((url) => {
    if (String(url).startsWith('/view-prs/labels')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, labels }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, overrides: userDefaultsOverrides }),
    });
  });
};

const labelsFetchCalls = () => fetch.mock.calls.filter(([url]) => String(url).startsWith('/view-prs/labels'));

describe('RepoLabelsProvider + ApplyLabelSelect/PrActionsCell wiring', () => {
  afterEach(() => {
    delete window.getReactPrTableSelectedRepo;
    jest.restoreAllMocks();
  });

  // Phase 7 (see REACT_MIGRATION_PLAN.md): closes a real coverage gap -
  // neither window.updateReactApplyLabelOptions (the old push into AppRoot's
  // own local state) nor window.getAvailableRepoLabels (the old
  // PrActionsCell.jsx pull) had any test proving a single update actually
  // reached both real consumers at once, since they were two entirely
  // separate bridges for the same underlying list. Mounts the real Provider
  // with both real consumers together, exercising its own real fetch
  // end-to-end (triggered automatically by the initial selectedRepo, same
  // as the real app).
  test('given both real consumers mounted under one Provider, when the real fetch resolves, then both see the same labels', async () => {
    mockFetch([{ name: 'bug' }, { name: 'enhancement' }]);

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <ApplyLabelSelect />
        <table>
          <tbody>
            <tr>
              <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} />
            </tr>
          </tbody>
        </table>
      </TestProviders>,
    );

    expect(screen.getByLabelText('Add label to PR #101').options).toHaveLength(1);
    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');

    await waitFor(() => {
      const runFilterSelect = document.getElementById('apply-label-select');
      expect(Array.from(runFilterSelect.options).map((option) => option.value)).toEqual([
        '',
        'bug',
        'enhancement',
      ]);
    });
    expect(labelsFetchCalls()).toEqual([['/view-prs/labels?repo=owner%2Frepo']]);

    const rowSelect = screen.getByLabelText('Add label to PR #101');
    expect(Array.from(rowSelect.options).map((option) => option.value)).toEqual(['', 'bug', 'enhancement']);
  });

  test('given a PR that already has one of the labels, when rendering its row select, then that label is excluded but the Run tab select still lists it', async () => {
    mockFetch([{ name: 'bug' }, { name: 'enhancement' }]);

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <ApplyLabelSelect />
        <table>
          <tbody>
            <tr>
              <PrActionsCell
                pr={{ number: '101', labels: ['bug'] }}
                repo="owner/repo"
                isFlagged={false}
                isInReview={false}
              />
            </tr>
          </tbody>
        </table>
      </TestProviders>,
    );

    await waitFor(() => {
      const rowSelect = screen.getByLabelText('Add label to PR #101');
      expect(Array.from(rowSelect.options).map((option) => option.value)).toEqual(['', 'enhancement']);
    });

    const runFilterSelect = document.getElementById('apply-label-select');
    expect(Array.from(runFilterSelect.options).map((option) => option.value)).toEqual([
      '',
      'bug',
      'enhancement',
    ]);
  });

  test('given the fetch resolves with a non-array labels field, when rendering, then it falls back to no labels rather than throwing', async () => {
    mockFetch(null);

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <ApplyLabelSelect />
      </TestProviders>,
    );

    await waitFor(() => expect(labelsFetchCalls().length).toBe(1));
    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');
  });

  test('given the fetch rejects, when rendering, then it falls back to no labels rather than throwing', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <ApplyLabelSelect />
      </TestProviders>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');
  });
});

// Phase G.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// RepoLabelsProvider owns the "refetch labels when the selected repo
// changes" trigger. Cleanup pass (see this file's own header comment):
// these tests assert on the real `fetch` call, since the fetch itself
// lives here now.
describe('RepoLabelsProvider repo-change trigger', () => {
  afterEach(() => {
    delete window.getReactPrTableSelectedRepo;
    jest.restoreAllMocks();
  });

  test('given an initial selectedRepo, when mounting, then the real fetch is made once for it', async () => {
    mockFetch([]);

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <div />
      </TestProviders>,
    );

    await waitFor(() => expect(labelsFetchCalls().length).toBe(1));
    expect(labelsFetchCalls()[0]).toEqual(['/view-prs/labels?repo=owner%2Frepo']);
  });

  test('given no selectedRepo yet and no repo field value, when mounting, then no labels fetch is made', async () => {
    mockFetch([]);

    render(
      <TestProviders>
        <div />
      </TestProviders>,
    );

    // Give the (unrelated) FilterStateProvider restore fetch a tick to
    // settle, so a wrongly-triggered labels fetch would have had time to
    // happen too.
    await act(async () => {
      await Promise.resolve();
    });
    expect(labelsFetchCalls()).toEqual([]);
  });

  test('given an unrelated re-render with the same selectedRepo, when it happens, then the labels fetch is not made again', async () => {
    mockFetch([]);

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <div />
      </TestProviders>,
    );
    await waitFor(() => expect(labelsFetchCalls().length).toBe(1));

    act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo');
    });

    expect(labelsFetchCalls().length).toBe(1);
  });

  test('given selectedRepo changes to a different repo, when it happens, then the labels fetch is made again with the new repo', async () => {
    mockFetch([]);

    render(
      <TestProviders initialSelectedRepo="owner/repo-a">
        <div />
      </TestProviders>,
    );
    await waitFor(() => expect(labelsFetchCalls().length).toBe(1));

    act(() => {
      window.updateReactPrTable(undefined, 'owner/repo-b');
    });

    await waitFor(() => expect(labelsFetchCalls().length).toBe(2));
    expect(labelsFetchCalls()[1]).toEqual(['/view-prs/labels?repo=owner%2Frepo-b']);
  });
});

// Cleanup pass (prompted by a direct instruction to reconsider the
// structure so no window.* bridge is needed at all - see this file's own
// header comment): FilterStateProvider.jsx's restore-on-mount effect used
// to reach window.refreshAvailableRepoLabels directly once a *saved* repo
// override was known. It's a genuine ANCESTOR of this Provider
// (FilterStateProvider wraps <AppRoot/>; this Provider is a descendant
// AppRoot renders further down its own JSX), so instead of calling down
// into a child, it now just publishes `restoredRepoOverride` as a plain
// piece of its own Context value - this Provider reacts to it with its
// own effect, the same already-valid "ancestor state flows down" Context
// direction every other field here already uses. These tests exercise
// that path end-to-end: a real FilterStateProvider restore (mocked
// /view-prs/user-defaults response carrying a `repo` override) triggering
// a real /view-prs/labels fetch, with zero window.* involved anywhere.
describe('RepoLabelsProvider reacts to a restored repo override', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('given no selectedRepo yet, when a saved repo override restores, then the real fetch is made for it', async () => {
    mockFetch([{ name: 'bug' }], { repo: 'owner/restored-repo' });

    render(
      <TestProviders>
        <ApplyLabelSelect />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(labelsFetchCalls()).toEqual([['/view-prs/labels?repo=owner%2Frestored-repo']]);
    });
    await waitFor(() => {
      expect(document.getElementById('apply-label-select')).not.toHaveDisplayValue('No labels found for this repo');
    });
  });

  test('given selectedRepo already triggered its own fetch, when a *different* saved repo override restores shortly after, then a second fetch is made for the restored repo too', async () => {
    mockFetch([], { repo: 'owner/restored-repo' });

    render(
      <TestProviders initialSelectedRepo="owner/already-applied-repo">
        <div />
      </TestProviders>,
    );

    await waitFor(() => {
      expect(labelsFetchCalls()).toEqual([
        ['/view-prs/labels?repo=owner%2Falready-applied-repo'],
        ['/view-prs/labels?repo=owner%2Frestored-repo'],
      ]);
    });
  });

  test('given no saved repo override at all (an empty restore), when mounting, then no extra labels fetch happens beyond the selectedRepo-driven one', async () => {
    mockFetch([], {});

    render(
      <TestProviders initialSelectedRepo="owner/repo">
        <div />
      </TestProviders>,
    );

    await waitFor(() => expect(labelsFetchCalls().length).toBe(1));
    // Give the restore effect's own promise chain a tick to fully settle,
    // so a wrongly-triggered second fetch would have had time to happen.
    await act(async () => {
      await Promise.resolve();
    });
    expect(labelsFetchCalls().length).toBe(1);
  });
});

describe('RepoLabelsProvider refresh() dedup/fallback rules', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('given a repoOverride, a currentRepo (selectedRepo), and a repo field value, when refresh is called with no override, then it uses the field value as a last resort', async () => {
    mockFetch([]);

    render(
      <TestProviders initialFilterValues={{ repo: 'owner/typed-repo' }}>
        <TestRefreshButton />
      </TestProviders>,
    );

    screen.getByText('refresh').click();

    await waitFor(() => expect(labelsFetchCalls()).toEqual([['/view-prs/labels?repo=owner%2Ftyped-repo']]));
  });

  test('given no repoOverride, no selectedRepo, and no repo field value, when refresh is called, then no labels fetch is made', async () => {
    mockFetch([]);

    render(
      <TestProviders>
        <TestRefreshButton />
      </TestProviders>,
    );

    screen.getByText('refresh').click();

    await act(async () => {
      await Promise.resolve();
    });
    expect(labelsFetchCalls()).toEqual([]);
  });
});
