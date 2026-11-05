/** @jest-environment jsdom */

const { render, screen, act, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterStateProvider: RealFilterStateProvider } = require('./FilterStateProvider');
const { buildFilterStateInitialValues } = require('./filterStateInitialValues');
const {
  useFilterState,
  useFilterFieldValue,
  useFilterFieldActions,
  FilterFieldStoreContext,
} = require('./FilterStateContext');
const { useContext } = require('react');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('./AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('./ChangeFilterActorSelectionProvider');
const { useRowFilterSelection } = require('./RowFilterSelectionContext');
const { useAuthorThreadResolutionSelection } = require('./AuthorThreadResolutionSelectionContext');
const { useChangeFilterActorSelection } = require('./ChangeFilterActorSelectionContext');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor) - every render() in this file needs these 3
// ancestors now, not just the persistence-focused tests further down.
function FilterStateProviderWithSelectionContexts({ initialValues, children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <RealFilterStateProvider initialValues={initialValues}>{children}</RealFilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}

function Probe() {
  const { values, setValue } = useFilterState();
  return (
    <div>
      <span data-testid="filter-pr-numbers-value">{values.filterPrNumbers}</span>
      <span data-testid="always-show-value">{String(values.alwaysShowInReview)}</span>
      <button onClick={() => setValue('filterPrNumbers', 'last-run')}>change PRs filter</button>
    </div>
  );
}

// Cleanup pass (prompted by a direct instruction to reconsider the
// repo-labels structure so no window.* bridge is needed at all, see
// REACT_MIGRATION_PLAN.md): exposes `restoredRepoOverride` so tests can
// assert on it directly, at the source, rather than only indirectly
// through RepoLabelsProvider.test.jsx's own consumer-side coverage.
function RestoredRepoOverrideProbe() {
  const { restoredRepoOverride } = useFilterState();
  return <span data-testid="restored-repo-override">{String(restoredRepoOverride)}</span>;
}

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): mimics
// the lists' own setChecked calls for the 3 Contexts
// buildOverrides() now reads directly, for the regression test below.
function MultiSelectSelectionProbe() {
  const rowFilterSelection = useRowFilterSelection();
  const authorThreadResolutionSelection = useAuthorThreadResolutionSelection();
  const changeFilterActorSelection = useChangeFilterActorSelection();
  return (
    <div>
      <button onClick={() => rowFilterSelection.setChecked('author-list', ['zuser'])}>
        check zuser (author)
      </button>
      <button
        onClick={() =>
          authorThreadResolutionSelection.setChecked(
            'attention-author-thread-resolution-allow-list',
            ['allowed-user'],
          )
        }
      >
        check allowed-user (thread resolution)
      </button>
      <button
        onClick={() =>
          changeFilterActorSelection.setChecked(
            'change-filter-ignore-comment-authors-list',
            ['ignored-user'],
          )
        }
      >
        check ignored-user (change filter)
      </button>
    </div>
  );
}

describe('FilterStateProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('given initialValues, when rendering, then children see them via useFilterState()', () => {
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: 'needs-attention', alwaysShowInReview: true }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    expect(screen.getByTestId('filter-pr-numbers-value')).toHaveTextContent('needs-attention');
    expect(screen.getByTestId('always-show-value')).toHaveTextContent('true');
  });

  test('given a value change, when it happens, then every Context reader sees it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: '', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    await user.click(screen.getByText('change PRs filter'));

    expect(screen.getByTestId('filter-pr-numbers-value')).toHaveTextContent('last-run');
  });

  // Window-bridge elimination Phase 5b (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // these two bridges had no production caller once PrSelectionCell moved to the
  // per-key store, so they were deleted rather than kept for tests.
  test('given the provider mounts, when window is inspected, then getFilterStateValues/setFilterStateValue are not published', () => {
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: '', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    expect(window.getFilterStateValues).toBeUndefined();
    expect(window.setFilterStateValue).toBeUndefined();
  });

  // Phase H.26 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): the 5 tests that used to live here asserted on
  // window.debouncedApplyFilters's own call count/timing - that bridge
  // (and the useDebouncedEffect call in FilterStateProvider.tsx that fired
  // it) is deleted outright, confirmed to have had zero remaining real
  // effect. Removed rather than rewritten, since there's no replacement
  // mechanism to assert on - this file's own debounced-timer test
  // infrastructure (fake timers, userEvent's advanceTimers option) stays,
  // still needed by the tests above/below that aren't about this bridge.


  // Cleanup pass (prompted by a direct instruction to reconsider the
  // repo-labels structure so no window.* bridge is needed at all, see
  // REACT_MIGRATION_PLAN.md): the restore-on-mount effect used to call
  // window.refreshAvailableRepoLabels directly once a saved repo override
  // was known - RepoLabelsProvider.tsx (a genuine descendant) now reads
  // this signal via useFilterState() instead. These tests cover the
  // signal itself, at the source; RepoLabelsProvider.test.jsx's own
  // "reacts to a restored repo override" suite covers the real consumer
  // reacting to it end-to-end.
  describe('merge commit rules (saved as mergeCommitRules)', () => {
    let putBody;
    const mockUserDefaults = (overrides) => {
      putBody = null;
      global.fetch = jest.fn(async (url, init = {}) => {
        if (String(url) === '/view-prs/user-defaults' && !init.method) {
          return { ok: true, json: async () => ({ ok: true, overrides }) };
        }
        if (String(url) === '/view-prs/user-defaults' && init.method === 'PUT') {
          putBody = JSON.parse(init.body);
        }
        return { ok: true, json: async () => ({ ok: true }) };
      });
    };

    function MergeRulesProbe() {
      const { values, setValue } = useFilterState();
      return (
        <div>
          <span data-testid="merge-patterns">{JSON.stringify(values.mergeCommitHeadlinePatterns)}</span>
          <span data-testid="merge-logins">{JSON.stringify(values.mergeCommitLogins)}</span>
          <button onClick={() => setValue('mergeCommitLogins', 'dependabot[bot]\n renovate[bot] ')}>add bots</button>
          <button onClick={() => setValue('filterPrNumbers', 'last-run')}>change PRs filter</button>
          <button onClick={() => setValue('filterSearch', 'parser')}>search</button>
        </div>
      );
    }

    const renderProbe = () =>
      render(
        <FilterStateProviderWithSelectionContexts
          initialValues={{ filterPrNumbers: '', mergeCommitHeadlinePatterns: '^Merge\\b', mergeCommitLogins: '' }}
        >
          <MergeRulesProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

    const flushPersist = () =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(150);
      });

    afterEach(() => {
      delete global.fetch;
    });

    test('given saved mergeCommitRules, when the restore resolves, then both lists show one entry per line', async () => {
      mockUserDefaults({ mergeCommitRules: { headlinePatterns: ['^Sync', '^Merge\\b'], logins: ['bot[bot]'] } });
      renderProbe();

      await waitFor(() =>
        expect(screen.getByTestId('merge-patterns').textContent).toBe(JSON.stringify('^Sync\n^Merge\\b')),
      );
      expect(screen.getByTestId('merge-logins').textContent).toBe(JSON.stringify('bot[bot]'));
    });

    test('given settings saved with the old built-in merge filter turned off, when the restore resolves, then the default rules stay', async () => {
      mockUserDefaults({ changeFilters: { useBuiltinMergePattern: false, ignoreCommitPatterns: ['^docs:'] } });
      renderProbe();
      await act(async () => {});

      expect(screen.getByTestId('merge-patterns').textContent).toBe(JSON.stringify('^Merge\\b'));
    });

    test('given lists saved as a single string or malformed (e.g. hand-edited), when the restore resolves, then a string is one entry and anything else is the default', async () => {
      mockUserDefaults({ mergeCommitRules: { headlinePatterns: ' ^Sync ', logins: 5 } });
      renderProbe();

      await waitFor(() => expect(screen.getByTestId('merge-patterns').textContent).toBe(JSON.stringify('^Sync')));
      expect(screen.getByTestId('merge-logins').textContent).toBe(JSON.stringify(''));
    });

    test('given changed merge logins, when the persist debounce fires, then mergeCommitRules is saved (trimmed, one per entry)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockUserDefaults({});
      renderProbe();

      await user.click(screen.getByText('add bots'));
      await flushPersist();

      expect(putBody.mergeCommitRules).toEqual({
        headlinePatterns: ['^Merge\\b'],
        logins: ['dependabot[bot]', 'renovate[bot]'],
      });
    });

    test('given the default rules and an old useBuiltinMergePattern setting, when saved, then neither mergeCommitRules nor the old setting is kept', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockUserDefaults({ changeFilters: { useBuiltinMergePattern: true, ignoreCommitPatterns: ['^docs:'] } });
      renderProbe();
      await act(async () => {});

      await user.click(screen.getByText('change PRs filter'));
      await flushPersist();

      expect(putBody).not.toHaveProperty('mergeCommitRules');
      expect(putBody.changeFilters).toEqual({ ignoreCommitPatterns: ['^docs:'] });
    });

    test('given saved settings restored on mount, when the persist debounce fires with nothing changed, then nothing is written', async () => {
      // The restore changes the values, which schedules a save; writing all
      // the settings back unchanged could only put back a value another tab
      // (or an e2e test's cleanup) changed meanwhile.
      mockUserDefaults({
        theme: 'dark',
        prSections: { flagged: { hidden: true } },
        mergeCommitRules: { headlinePatterns: ['^Sync'], logins: ['bot[bot]'] },
      });
      // The page's own starting values (every field's default).
      render(
        <FilterStateProviderWithSelectionContexts initialValues={buildFilterStateInitialValues()}>
          <MergeRulesProbe />
        </FilterStateProviderWithSelectionContexts>,
      );
      await waitFor(() => expect(screen.getByTestId('merge-patterns').textContent).toBe(JSON.stringify('^Sync')));
      await flushPersist();

      expect(putBody).toBeNull();
    });

    test('given a search typed, when the persist debounce passes, then the saved settings are neither read nor written - and a later change still saves', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockUserDefaults({});
      renderProbe();
      await act(async () => {});
      await flushPersist();
      global.fetch.mockClear();

      await user.click(screen.getByText('search'));
      await flushPersist();
      expect(global.fetch).not.toHaveBeenCalled();

      await user.click(screen.getByText('change PRs filter'));
      await flushPersist();
      expect(JSON.stringify(putBody)).toContain('"last-run"');
      expect(JSON.stringify(putBody)).not.toContain('parser');
    });

    // (Not merge rules: this describe has the save and restore harness.)
    test.each([
      ['needs-attention', { onlyNeedsAttention: true, onlyThreadsToCheck: false }, { 'only-needs-attention': true }],
      ['needs-attention-or-interacted', { onlyNeedsAttention: true, onlyThreadsToCheck: false }, { 'only-needs-attention': true }],
      ['resolved-for-me', { onlyNeedsAttention: false, onlyThreadsToCheck: true }, { 'only-threads-to-check': true }],
      ['last-run', { onlyNeedsAttention: false, onlyThreadsToCheck: false }, {}],
    ])('given a "View scope" saved as %s, then it restores as its checkbox, and the next save keeps that in its place', async (scope, restored, saved) => {
      mockUserDefaults({ 'scope-mode': scope, 'filter-pr-numbers': '7' });
      let latest;
      function OnlyProbe() {
        latest = useFilterState().values;
        return null;
      }
      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: '', onlyNeedsAttention: false, onlyThreadsToCheck: false }}>
          <OnlyProbe />
        </FilterStateProviderWithSelectionContexts>,
      );
      await waitFor(() => expect(latest.filterPrNumbers).toBe('7'));
      expect({ onlyNeedsAttention: latest.onlyNeedsAttention, onlyThreadsToCheck: latest.onlyThreadsToCheck }).toEqual(restored);

      await flushPersist();
      expect(putBody).not.toHaveProperty('scope-mode');
      expect(putBody['filter-pr-numbers']).toBe('7');
      expect(putBody['only-needs-attention']).toBe(saved['only-needs-attention']);
      expect(putBody['only-threads-to-check']).toBe(saved['only-threads-to-check']);
    });

    test('given the checkboxes saved too, then a leftover "View scope" doesn\'t change them', async () => {
      mockUserDefaults({ 'scope-mode': 'needs-attention', 'only-needs-attention': false });
      let latest;
      function OnlyProbe() {
        latest = useFilterState().values;
        return null;
      }
      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ onlyNeedsAttention: false }}>
          <OnlyProbe />
        </FilterStateProviderWithSelectionContexts>,
      );
      await act(async () => {});
      await flushPersist();
      expect(latest.onlyNeedsAttention).toBe(false);
    });

    test("given the saved settings can't be read, when the persist debounce fires, then nothing is written (it would lose them)", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockUserDefaults({});
      const succeeding = global.fetch;
      global.fetch = jest.fn(async (url, init = {}) =>
        String(url) === '/view-prs/user-defaults' && !init.method ? { ok: false, status: 500 } : succeeding(url, init),
      );
      renderProbe();
      await act(async () => {});

      await user.click(screen.getByText('add bots'));
      await flushPersist();

      expect(putBody).toBeNull();
    });
  });

  describe('restoredRepoOverride (restore-on-mount)', () => {
    afterEach(() => {
      delete global.fetch;
    });

    test('given a saved repo override, when the restore fetch resolves, then restoredRepoOverride reflects it', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url) === '/view-prs/user-defaults') {
          return { ok: true, json: async () => ({ ok: true, overrides: { repo: 'owner/restored-repo' } }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ repo: '' }}>
          <RestoredRepoOverrideProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

      await screen.findByText('owner/restored-repo');
    });

    test('given no saved overrides at all, when the restore fetch resolves, then restoredRepoOverride stays null', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url) === '/view-prs/user-defaults') {
          return { ok: true, json: async () => ({ ok: true, overrides: {} }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ repo: '' }}>
          <RestoredRepoOverrideProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('restored-repo-override')).toHaveTextContent('null');
    });

    test('given saved overrides with no repo key, when the restore fetch resolves, then restoredRepoOverride stays null', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url) === '/view-prs/user-defaults') {
          return { ok: true, json: async () => ({ ok: true, overrides: { 'filter-pr-numbers': 'last-run' } }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ repo: '' }}>
          <RestoredRepoOverrideProbe />
          <Probe />
        </FilterStateProviderWithSelectionContexts>,
      );

      await screen.findByText('last-run');
      expect(screen.getByTestId('restored-repo-override')).toHaveTextContent('null');
    });
  });

  // Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // real regression this phase fixes - buildOverrides() used to read these
  // 3 lists via window.getSelectedXxx DOM-scan bridges (agnostic to
  // whether any Context existed); now it reads
  // RowFilterSelectionContext/AuthorThreadResolutionSelectionContext/
  // ChangeFilterActorSelectionContext directly, which only resolves
  // correctly if the lists (simulated here by
  // MultiSelectSelectionProbe) and FilterStateProvider are real siblings
  // under the same Provider instances - exactly the tree
  // FilterStateProviderWithSelectionContexts (and react-app.tsx's real
  // Provider tree, after this phase's reorder) now provides.
  describe('persisted overrides reflect the 3 selection Contexts directly', () => {
    let putBody;

    beforeEach(() => {
      putBody = null;
      global.fetch = jest.fn(async (url, init = {}) => {
        if (String(url) === '/view-prs/user-defaults' && !init.method) {
          return { ok: true, json: async () => ({ ok: true, overrides: {} }) };
        }
        if (String(url) === '/view-prs/user-defaults' && init.method === 'PUT') {
          putBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      });
    });

    afterEach(() => {
      delete global.fetch;
    });

    test('given checked values set via each selection Context, when the 150ms persist debounce fires, then all 3 are included in the persisted overrides', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: '', alwaysShowInReview: false }}>
          <MultiSelectSelectionProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

      await user.click(screen.getByText('check zuser (author)'));
      await user.click(screen.getByText('check allowed-user (thread resolution)'));
      await user.click(screen.getByText('check ignored-user (change filter)'));

      expect(putBody).toBeNull();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(150);
      });

      expect(putBody).not.toBeNull();
      expect(putBody.author).toEqual(['zuser']);
      expect(putBody['attention-author-thread-resolution-allow']).toEqual(['allowed-user']);
      expect(putBody.changeFilters.ignoreCommentsFromAuthors).toEqual(['ignored-user']);
    });
  });

  // Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the per-key store (filterValuesStore.ts) mirrors `values`. Every write path
  // updates both in the same call, so a store reader and a useFilterState()
  // reader can never disagree.
  describe('per-field store kept in sync with values', () => {
    let fieldValue;
    let fieldActions;
    let fieldContext;
    let state;
    function FieldProbe() {
      fieldValue = useFilterFieldValue('filterPrNumbers');
      fieldActions = useFilterFieldActions();
      fieldContext = useContext(FilterFieldStoreContext);
      state = useFilterState();
      return null;
    }
    const mount = (initialValues = { filterPrNumbers: '' }) =>
      render(
        <FilterStateProviderWithSelectionContexts initialValues={initialValues}>
          <FieldProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

    afterEach(() => {
      delete global.fetch;
    });

    test('given initial values, when a field reader mounts, then it sees them', () => {
      mount({ filterPrNumbers: 'needs-attention' });
      expect(fieldValue).toBe('needs-attention');
    });

    test('given a write through useFilterState().setValue, when read through the field store, then it is the same value', () => {
      mount();
      act(() => state.setValue('filterPrNumbers', 'last-run'));
      expect(fieldValue).toBe('last-run');
      expect(fieldActions.getFieldValue('filterPrNumbers')).toBe('last-run');
      expect(state.values.filterPrNumbers).toBe('last-run');
    });

    test('given a write through the field actions, when read through useFilterState(), then the whole-object Context has it too', () => {
      mount();
      act(() => fieldActions.setFieldValue('filterPrNumbers', 'needs-attention'));
      expect(state.values.filterPrNumbers).toBe('needs-attention');
      expect(fieldValue).toBe('needs-attention');
    });

    test('given saved overrides restore on mount, when the restore resolves, then the field store gets them too (not only useFilterState())', async () => {
      global.fetch = jest.fn(async (url) => {
        if (String(url) === '/view-prs/user-defaults') {
          return { ok: true, json: async () => ({ ok: true, overrides: { 'filter-pr-numbers': 'last-run' } }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      mount({ filterPrNumbers: '' });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(state.values.filterPrNumbers).toBe('last-run');
      expect(fieldValue).toBe('last-run');
    });

    test('given many writes and re-renders, when the field-store context is read each time, then it keeps one identity', () => {
      const seen = new Set();
      function IdentityProbe() {
        seen.add(useContext(FilterFieldStoreContext));
        return null;
      }
      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ filterPrNumbers: '' }}>
          <FieldProbe />
          <IdentityProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

      act(() => state.setValue('filterPrNumbers', 'a'));
      act(() => state.setValue('filterPrNumbers', 'b'));
      act(() => fieldActions.setFieldValue('filterPrNumbers', 'c'));

      expect(seen.size).toBe(1);
      expect(fieldContext).toBe([...seen][0]);
    });
  });
});
