/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');

// PrSection is mocked so these tests exercise PrTableApp's own logic
// (payload sync, repo resolution, getPrFlags, section building, toggle
// handlers) without depending on the full row/cell render tree — those are
// covered by PrSection.test.jsx / PrTable.test.jsx / PrRow.test.jsx already.
const capturedSectionProps = [];
jest.mock('./PrSection', () => {
  const ReactForMock = require('react');
  return {
    PrSection: (props) => {
      capturedSectionProps.push(props);
      return ReactForMock.createElement(
        'div',
        { 'data-testid': 'section', 'data-key': props.section.key },
        `${props.section.key}:${props.section.prs.length}`,
      );
    },
  };
});

// ES module cleanup (see REACT_MIGRATION_PLAN.md): pr-section-config.helpers.ts/
// pr-smart-groups.helpers.ts are real ES modules now, imported directly by
// PrTableApp.jsx instead of read off window.ViewPrsSectionConfigHelpers/
// window.ViewPrsSmartGroupsHelpers - these tests used to swap window
// globals per-test to control their behavior; jest.mock + mockImplementation
// is the equivalent for a real import.
jest.mock('../helpers/pr-section-config.helpers.ts', () => ({
  createPrSectionConfigHelpers: jest.fn(),
}));
jest.mock('../helpers/pr-smart-groups.helpers.ts', () => ({
  createPrSmartGroupsHelpers: jest.fn(),
}));
// Phase 7 (see REACT_MIGRATION_PLAN.md): pr-row-sorting.helpers.ts is a
// real ES module now too, imported directly by PrTableApp.jsx instead of
// read off window.sortRowsByPrNumberDesc/etc - same "jest.mock is the
// equivalent for a real import" reasoning as above. Unlike those two,
// this mock keeps the REAL sorting behavior for every export (tests rely
// on rows actually being sorted) and only wraps sortRowsByPrNumberDesc in
// a jest.fn() so the one test that cares about call counts (see "row
// sorting" below) can assert on it - normalizeRows/sortRowsByDateFieldDesc
// pass through untouched.
jest.mock('../helpers/pr-row-sorting.helpers.ts', () => {
  const actual = jest.requireActual('../helpers/pr-row-sorting.helpers.ts');
  return { ...actual, sortRowsByPrNumberDesc: jest.fn(actual.sortRowsByPrNumberDesc) };
});

// Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// PrTableApp.jsx no longer accepts onAckAction/onApplyLabel as props - it
// builds its own real handlers via useAckLabelActions(), which reaches
// the real pr-ack-label-actions.helpers.ts factory and (through it) the
// real postJson. Mocking postJson here is the new seam for the
// "per-row busy spinner" tests below, replacing the old prop-injection
// seam.
jest.mock('../helpers/pr-http.helpers.ts', () => ({
  postJson: jest.fn(),
}));

const { PrTableApp } = require('./PrTableApp');
const { postJson } = require('../helpers/pr-http.helpers.ts');
const { sortRowsByPrNumberDesc } = require('../helpers/pr-row-sorting.helpers.ts');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): pushes
// payloads through this probe (PrDataProvider's applyFreshTablePayload), not
// window.updateReactPrTable.
const prDataProbe = createPrDataProbe();
const { NeedsAttentionContext, defaultNeedsAttention } = require('../state/NeedsAttentionContext');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');
const { PrActivityQueueProvider } = require('./PrActivityQueueProvider');
const { usePrActivityQueue } = require('../state/PrActivityQueueContext');

// Tenth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// window.markPrsBusy/clearPrsBusy/markPrsQueued/clearPrsQueued are gone -
// tests below that used to drive busy/queued state through those bridges
// now call this Context value's own markPrBusy/clearPrBusy/markPrQueued/
// clearPrQueued directly instead, same functions useAckLabelActions.tsx/
// useQuickCheckActions.tsx already call.
let capturedActivityQueue;
function ActivityQueueProbe() {
  capturedActivityQueue = usePrActivityQueue();
  return null;
}

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor) - the 3 selection Providers wrap PrDataProvider/
// FilterStateProvider now, not the other way around, matching
// react-app.jsx's real AppRoot order after this phase's reorder.
function AllSelectionProviders({ children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>{children}</ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}
const { createPrSectionConfigHelpers } = require('../helpers/pr-section-config.helpers.ts');
const { createPrSmartGroupsHelpers } = require('../helpers/pr-smart-groups.helpers.ts');

// Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// PrTableApp reads payload/selectedRepo/visiblePrNumbers from
// <PrDataProvider /> now, not as direct props - this wraps every render the
// same way mountReactPrTable (react-app.jsx) really does. Updates after the
// initial render go through the Provider's own applyFreshTablePayload (via
// prDataProbe; it was the window.updateReactPrTable bridge), not a
// `rerender` with new props - see the "delivers a fresh
// payload" test below for the real post-mount update path.
//
// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): `needsAttention`
// merges onto defaultNeedsAttention (state/NeedsAttentionContext.tsx) and is
// provided via Context - the real app's <NeedsAttentionProvider /> derives
// this from FilterStateProvider/ActorIdentityContext, but tests here want
// direct per-test control instead, the same way renderCell's
// actorIdentityOverrides works in PrApprovedCell.test.jsx.
//
// Activity drawer feature (see REACT_MIGRATION_PLAN.md): busyPrNumbers/
// queuedPrNumbers moved from PrTableApp's own local state into
// PrActivityQueueProvider.tsx - this wraps every render the same way
// react-app.jsx's real AppRoot now does. Tenth follow-up (see
// REACT_MIGRATION_PLAN.md, "Remaining-effort audit"): the markPrsBusy/
// clearPrsBusy/markPrsQueued/clearPrsQueued window bridges that used to
// drive this in tests are gone - ActivityQueueProbe above exposes the
// same Context functions directly instead.
// Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): visiblePrNumbers
// is no longer read from PrDataProvider by PrTableApp - useVisiblePrNumbers()
// derives it live from Context instead (see that hook's own comment).
// PrDataProvider itself stopped accepting an initial value for it once the
// vanilla computation that used to feed it was confirmed dead and deleted
// (see REACT_MIGRATION_PLAN.md's cleanup entry). FilterStateProvider/
// RowFilterSelectionProvider are required ancestors for useVisiblePrNumbers()
// - `filterStateValues` lets an individual test override the defaults
// below (e.g. to exercise a specific scope/PR-number filter) without every
// existing call site needing to pass a full values object.
const renderPrTableApp = ({
  initialPayload,
  selectedRepo,
  needsAttention,
  filterStateValues,
  ...tableProps
} = {}) =>
  render(
    <AllSelectionProviders>
      <PrDataProvider
        initialPayload={initialPayload}
        initialSelectedRepo={selectedRepo}
      >
        <prDataProbe.PrDataProbe />
        <FilterStateProvider
          initialValues={{
            scopeMode: 'all',
            filterPrNumbers: '',
            alwaysShowInReview: false,
            filterCustomComments: '',
            filterOtherNotes: '',
            filterPrDifficulty: '',
            filterRallyStories: '',
            filterRallyLinks: '',
            filterAnalysisOfPr: '',
            ...filterStateValues,
          }}
        >
          <NeedsAttentionContext.Provider value={{ ...defaultNeedsAttention, ...needsAttention }}>
            <PrActivityQueueProvider>
              <ActivityQueueProbe />
              <PrTableApp {...tableProps} />
            </PrActivityQueueProvider>
          </NeedsAttentionContext.Provider>
        </FilterStateProvider>
      </PrDataProvider>
    </AllSelectionProviders>,
  );

function installSectionHelpers() {
  // Minimal stand-in for the real vanilla helpers: one lifecycle section per
  // grouped.<key> array, in a fixed order, mirroring the shape
  // pr-section-config.helpers.ts actually returns.
  createPrSectionConfigHelpers.mockImplementation(
    // Mirrors pr-section-config.helpers.ts's real safe-default behavior: if
    // the caller doesn't override resolvePrSectionOpenState, each section
    // falls back to its own configured default (false for lifecycle
    // sections, whatever the smart group specifies for its own).
    ({ resolvePrSectionOpenState } = {}) => {
      const resolve =
        typeof resolvePrSectionOpenState === 'function'
          ? resolvePrSectionOpenState
          : (_openState, _sectionKey, fallbackOpen) => Boolean(fallbackOpen);
      return {
        buildPrSectionConfigs: ({ grouped, smartGroups }) => {
          const lifecycleConfigs = ['open', 'draft', 'merged', 'closed'].map((key) => ({
            sectionKey: key,
            title: key,
            rows: grouped[key] || [],
            isSmartGroup: false,
            dateHeader: 'LAST ACTIVITY',
            isOpen: resolve(undefined, key, false),
          }));
          const smartGroupConfigs = smartGroups
            ? Object.entries(smartGroups).map(([key, group]) => ({
                sectionKey: key,
                title: group.title,
                rows: group.rows || [],
                isSmartGroup: true,
                dateHeader: 'LAST ACTIVITY',
                isOpen: resolve(undefined, key, group.defaultOpen),
              }))
            : [];
          return [...smartGroupConfigs, ...lifecycleConfigs];
        },
      };
    },
  );
}

function installSmartGroupHelpers() {
  createPrSmartGroupsHelpers.mockImplementation(({ hasNeedsAttentionFlag }) => ({
    buildSmartGroupConfigs: () => ({ flagged: { title: 'Flagged', defaultOpen: false } }),
    applySmartGroups: (allEntries) => ({
      flagged: { title: 'Flagged', rows: allEntries.filter((entry) => hasNeedsAttentionFlag(entry)) },
    }),
  }));
}

function clearWindowHelpers() {
  createPrSectionConfigHelpers.mockReset();
  createPrSmartGroupsHelpers.mockReset();
  // Phase 7 (see REACT_MIGRATION_PLAN.md): window.isInReviewEnabled is
  // confirmed dead for PrTableApp (checkNeedsAttention never reads it -
  // see the regression tests below that set it specifically to prove
  // that) - this cleanup just avoids the value leaking across tests, it
  // has no effect on PrTableApp's own behavior either way.
  delete window.isInReviewEnabled;
  prDataProbe.reset();
}

function makeEntry({ prNumber, repo, section, rowOrder, mergedAt, closedAt }) {
  return {
    prNumber,
    repo,
    section,
    rowOrder,
    data: { number: prNumber, viewerLogin: '', mergedAt, closedAt },
  };
}

describe('PrTableApp', () => {
  beforeEach(() => {
    capturedSectionProps.length = 0;
    postJson.mockReset();
    installSectionHelpers();
    // ES module cleanup (see REACT_MIGRATION_PLAN.md): PrTableApp.jsx's
    // `if (prSmartGroupsHelperFactory)` guard is always true now (a real
    // import, unlike the old `if (window.ViewPrsSmartGroupsHelpers)` check
    // most tests here relied on being falsy by default to skip smart
    // groups entirely) - this default mock produces the same *observable*
    // result buildPrSectionConfigs saw before (`smartGroups` empty/absent),
    // without changing PrTableApp.jsx's own structure. Tests that actually
    // exercise smart groups override this via installSmartGroupHelpers()
    // or a one-off mockImplementation.
    createPrSmartGroupsHelpers.mockImplementation(() => ({
      buildSmartGroupConfigs: () => ({}),
      applySmartGroups: () => ({}),
    }));
  });
  afterEach(clearWindowHelpers);

  test('given no payload, when rendering, then shows the loading state instead of any sections', () => {
    renderPrTableApp({ initialPayload: null, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(screen.getByText('Loading Pull Requests...')).toBeInTheDocument();
    expect(screen.queryByTestId('section')).not.toBeInTheDocument();
  });

  // ES module cleanup (see REACT_MIGRATION_PLAN.md): the "helpers module
  // entirely missing" scenario this used to cover (window.ViewPrsX never
  // set) is structurally impossible now that PrTableApp.jsx imports
  // pr-section-config.helpers.ts directly - a real ES import always
  // resolves before this component's own code runs, so `helpers` can never
  // be falsy via this path. Removed rather than kept as dead coverage for
  // something that can no longer happen.

  test('given entries for one repo, when no selectedRepo is passed, then effectiveRepo falls back to that repo', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'closed' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps[0].repo).toBe('owner/repo');
  });

  test('given no lastRun.repo, a single low-numbered placeholder-repo entry outnumbered by a real repo\'s entries, when no selectedRepo is passed, then effectiveRepo picks the repo with the most entries (not just the numerically-first one)', () => {
    // Regression test: Object.values() on an object keyed by numeric-looking
    // strings iterates in ascending numeric order regardless of insertion
    // order, so a single synthetic/seeded row (e.g. PR #1 with a placeholder
    // repo like "owner/repo") can sort before a user's real PRs just by
    // having a lower number. Picking "the first entry found" used to let
    // that one synthetic row hijack effectiveRepo and hide every real PR.
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        100: makeEntry({ prNumber: '100', repo: 'real-org/real-repo', section: 'open' }),
        101: makeEntry({ prNumber: '101', repo: 'real-org/real-repo', section: 'closed' }),
        102: makeEntry({ prNumber: '102', repo: 'real-org/real-repo', section: 'merged' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps[0].repo).toBe('real-org/real-repo');
  });

  test('given lastRun.repo, when no selectedRepo is passed, then effectiveRepo prefers it even over a repo with far more entries', () => {
    // lastRun.repo (recorded by check-open-pr-updates.sh) reflects which
    // repo was most recently actively scanned — a stronger signal for "what
    // the user is currently tracking" than raw entry counts, since a
    // newly-tracked repo would otherwise lose to an older repo's larger
    // accumulated history.
    const payload = {
      lastRun: { repo: 'new-org/new-repo', updatedAt: '2026-01-01T00:00:00Z' },
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'old-org/old-repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'old-org/old-repo', section: 'closed' }),
        3: makeEntry({ prNumber: '3', repo: 'old-org/old-repo', section: 'merged' }),
        4: makeEntry({ prNumber: '4', repo: 'new-org/new-repo', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps[0].repo).toBe('new-org/new-repo');
  });

  test('given a blank lastRun.repo, when no selectedRepo is passed, then effectiveRepo falls back to the most-common-entries logic', () => {
    const payload = {
      lastRun: { repo: '', updatedAt: '2026-01-01T00:00:00Z' },
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'real-org/real-repo', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps[0].repo).toBe('real-org/real-repo');
  });

  test('given entries for multiple repos, when selectedRepo is passed, then every repo\'s entries still populate the sections (PR data for a non-current repo must still render)', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo-a', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo-b', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo-b', onCheckboxChange: () => {}, onAckAction: () => {} });
    const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSection.section.prs).toHaveLength(2);
    expect(openSection.section.prs.map((entry) => entry.repo).sort()).toEqual([
      'owner/repo-a',
      'owner/repo-b',
    ]);
  });

  test('given flaggedByRepo/inReviewByRepo/ackByRepo for the effective repo, when getPrFlags is called, then reflects that repo\'s state', () => {
    const payload = {
      byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) },
      flaggedByRepo: { 'owner/repo': { 1: true } },
      inReviewByRepo: { 'owner/repo': {} },
      ackByRepo: { 'owner/repo': { 1: '2026-01-01T00:00:00Z' } },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const flags = capturedSectionProps[0].getPrFlags('1');
    expect(flags).toEqual({ isFlagged: true, isInReview: false, isAcknowledged: true });
  });

  test('given getPrFlags for a repo with no stored flags at all, when called, then returns all-false rather than throwing', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps[0].getPrFlags('1')).toEqual({ isFlagged: false, isInReview: false, isAcknowledged: false });
  });

  test('given applyFreshTablePayload delivers a fresh payload (the real post-mount update path - see PrDataProvider.tsx), when called, then the new payload is reflected', () => {
    const payloadA = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    const payloadB = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payloadA, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(1);

    capturedSectionProps.length = 0;
    React.act(() => {
      prDataProbe.applyFreshTablePayload(payloadB);
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(2);
  });

  test('given a series of fresh payloads, when each is delivered, then the row action handlers keep the same identity (regression: Chrome/Edge "Error code: 5" renderer OOM)', () => {
    // useCallback handlers with differing deps chained older render
    // scopes together through the memoized rows that hold them, each
    // pinning that render's payload - one full payload leaked per data
    // change. Stable identities mean no older render is reachable.
    const makePayload = (count) => ({
      byPrNumber: Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
          index + 1,
          makeEntry({ prNumber: String(index + 1), repo: 'owner/repo', section: 'open' }),
        ]),
      ),
    });
    const handlerNames = ['onCheckboxChange', 'onAckAction', 'onApplyLabel', 'onUpdatePr'];
    const pickHandlers = () => {
      const props = capturedSectionProps.find((p) => p.section.key === 'open');
      return Object.fromEntries(handlerNames.map((name) => [name, props[name]]));
    };
    renderPrTableApp({ initialPayload: makePayload(1), selectedRepo: 'owner/repo' });
    const initialHandlers = pickHandlers();
    handlerNames.forEach((name) => expect(typeof initialHandlers[name]).toBe('function'));

    for (let count = 2; count <= 5; count += 1) {
      capturedSectionProps.length = 0;
      React.act(() => {
        prDataProbe.applyFreshTablePayload(makePayload(count));
      });
      expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(count);
      handlerNames.forEach((name) => expect(pickHandlers()[name]).toBe(initialHandlers[name]));
    }
  });

  test('given applyFreshTablePayload is called again with the same payload reference, when nothing actually changed, then the content is still correct', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    capturedSectionProps.length = 0;
    React.act(() => {
      prDataProbe.applyFreshTablePayload(payload);
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(1);
  });

  test('given onDataRefresh is called by a descendant (e.g. after a Notes save), when invoked with a new payload, then state updates to it', () => {
    const payloadA = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payloadA, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const { onDataRefresh } = capturedSectionProps[0];

    const payloadB = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    capturedSectionProps.length = 0;
    React.act(() => {
      onDataRefresh(payloadB);
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(2);
  });

  test('given onToggleSection is called, when toggled, then the matching section\'s isOpen flips', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const openSectionBefore = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSectionBefore.isOpen).toBe(false); // defaultOpen: false from the mocked helper

    capturedSectionProps.length = 0;
    React.act(() => {
      openSectionBefore.onToggleSection('open');
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').isOpen).toBe(true);
  });

  test('given a fresh load with no prior toggles, when sections are built, then lifecycle sections default closed and a smart group configured with defaultOpen:true (e.g. "Needs Attention") defaults open', () => {
    // Regression test: PrTableApp used to pass `resolvePrSectionOpenState: () => true`
    // to createPrSectionConfigHelpers, forcing every section open on every
    // load/refresh regardless of its own configured default. It should now
    // let each section fall through to its own default (lifecycle sections
    // closed; "In Review"/"Needs Attention" smart groups open).
    createPrSmartGroupsHelpers.mockImplementation(() => ({
      buildSmartGroupConfigs: () => ({
        needsAttention: { title: 'Needs Attention', defaultOpen: true },
      }),
      applySmartGroups: () => ({
        needsAttention: { title: 'Needs Attention', defaultOpen: true, rows: [] },
      }),
    }));

    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });

    expect(capturedSectionProps.find((p) => p.section.key === 'open').isOpen).toBe(false);
    expect(capturedSectionProps.find((p) => p.section.key === 'draft').isOpen).toBe(false);
    expect(capturedSectionProps.find((p) => p.section.key === 'merged').isOpen).toBe(false);
    expect(capturedSectionProps.find((p) => p.section.key === 'closed').isOpen).toBe(false);
    expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').isOpen).toBe(true);
  });

  test('given window.isInReviewEnabled(entry.data) is true but entryNeedsAttention is false, when smart groups are built, then the entry does NOT count as needing attention', () => {
    // Regression test: checkNeedsAttention previously OR'd in
    // window.isInReviewEnabled(entry?.data), so manually checking the "In
    // Review" checkbox on a PR made it show the Needs Attention icon and
    // join the Needs Attention smart group even with no actual unreviewed
    // activity (entryNeedsAttention false). "In Review" is a separate,
    // manually-set flag (see isInReviewEnabled/AlwaysShowInReviewCheckbox)
    // and must stay independent of needs-attention - checkNeedsAttention
    // should delegate to entryNeedsAttention only.
    window.isInReviewEnabled = (data) => data?.number === '1';
    createPrSmartGroupsHelpers.mockImplementation(({ hasNeedsAttentionFlag }) => ({
      buildSmartGroupConfigs: () => ({ needsAttention: { title: 'Needs Attention', defaultOpen: true } }),
      applySmartGroups: (allEntries) => ({
        needsAttention: {
          title: 'Needs Attention',
          defaultOpen: true,
          rows: allEntries.filter((entry) => hasNeedsAttentionFlag(entry)),
        },
      }),
    }));

    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({
      initialPayload: payload,
      selectedRepo: '',
      onCheckboxChange: () => {},
      onAckAction: () => {},
      needsAttention: { entryNeedsAttention: () => false },
    });

    expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(0);
  });

  test('given window.isInReviewEnabled(entry.data) is false but entryNeedsAttention is true, when smart groups are built, then the entry still counts as needing attention', () => {
    // Positive control for the regression test above: removing the
    // isInReviewEnabled OR must not also break the real attention signal.
    window.isInReviewEnabled = () => false;
    createPrSmartGroupsHelpers.mockImplementation(({ hasNeedsAttentionFlag }) => ({
      buildSmartGroupConfigs: () => ({ needsAttention: { title: 'Needs Attention', defaultOpen: true } }),
      applySmartGroups: (allEntries) => ({
        needsAttention: {
          title: 'Needs Attention',
          defaultOpen: true,
          rows: allEntries.filter((entry) => hasNeedsAttentionFlag(entry)),
        },
      }),
    }));

    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({
      initialPayload: payload,
      selectedRepo: '',
      onCheckboxChange: () => {},
      onAckAction: () => {},
      needsAttention: { entryNeedsAttention: () => true },
    });

    expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(1);
  });

  describe('attention config live-update', () => {
    test('given the "Needs Attention rules" config changes, when no section is toggled, then the Needs Attention smart group\'s membership updates immediately', () => {
      // Regression test: attentionConfig/entryNeedsAttention come from
      // NeedsAttentionContext, a real Context value the `sections` useMemo
      // depends on directly (see PrTableApp.jsx) - a change to either must
      // recompute smart-group membership on its own, without needing an
      // unrelated re-render (e.g. toggling a section) to happen to
      // invalidate the memo first.
      createPrSmartGroupsHelpers.mockImplementation(({ hasNeedsAttentionFlag }) => ({
        buildSmartGroupConfigs: () => ({ needsAttention: { title: 'Needs Attention', defaultOpen: true } }),
        applySmartGroups: (allEntries) => ({
          needsAttention: {
            title: 'Needs Attention',
            defaultOpen: true,
            rows: allEntries.filter((entry) => hasNeedsAttentionFlag(entry)),
          },
        }),
      }));

      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      const buildTree = (attentionFlag) => (
        <AllSelectionProviders>
          <PrDataProvider initialPayload={payload} initialSelectedRepo="">
            <FilterStateProvider initialValues={{ scopeMode: 'all', filterPrNumbers: '' }}>
              <NeedsAttentionContext.Provider value={{ ...defaultNeedsAttention, entryNeedsAttention: () => attentionFlag }}>
                <PrTableApp onCheckboxChange={() => {}} onAckAction={() => {}} />
              </NeedsAttentionContext.Provider>
            </FilterStateProvider>
          </PrDataProvider>
        </AllSelectionProviders>
      );

      const { rerender } = render(buildTree(false));
      expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(0);

      capturedSectionProps.length = 0;
      rerender(buildTree(true));

      expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(1);
    });
  });

  describe('row sorting', () => {
    test('given open PRs in arbitrary order, when rendering, then the Open section lists them newest-PR-number-first', () => {
      const payload = {
        byPrNumber: {
          10: makeEntry({ prNumber: '10', repo: 'owner/repo', section: 'open' }),
          30: makeEntry({ prNumber: '30', repo: 'owner/repo', section: 'open' }),
          20: makeEntry({ prNumber: '20', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
      const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
      expect(openSection.section.prs.map((entry) => entry.prNumber)).toEqual(['30', '20', '10']);
    });

    test('given merged PRs with different mergedAt dates, when rendering, then the Merged section lists them newest-merged-first', () => {
      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'merged', mergedAt: '2026-01-01T00:00:00Z' }),
          2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'merged', mergedAt: '2026-03-01T00:00:00Z' }),
          3: makeEntry({ prNumber: '3', repo: 'owner/repo', section: 'merged', mergedAt: '2026-02-01T00:00:00Z' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
      const mergedSection = capturedSectionProps.find((p) => p.section.key === 'merged');
      expect(mergedSection.section.prs.map((entry) => entry.prNumber)).toEqual(['2', '3', '1']);
    });

    test('given rows spanning multiple lifecycle sections with different rowOrder values, when building a smart group, then its rows follow rowOrder ascending (vanilla\'s cross-section ordering) rather than lifecycle-then-PR-number order', () => {
      createPrSmartGroupsHelpers.mockImplementation(() => ({
        buildSmartGroupConfigs: () => ({ needsAttention: { title: 'Needs Attention', defaultOpen: true } }),
        applySmartGroups: (allEntries) => ({
          needsAttention: { title: 'Needs Attention', defaultOpen: true, rows: allEntries },
        }),
      }));

      const payload = {
        byPrNumber: {
          // If smart groups merely concatenated grouped.open + grouped.merged
          // (each independently sorted), PR 1 (open, rowOrder 3) would come
          // before PR 2 (merged, rowOrder 1) since "open" rows are listed
          // first. normalizeRows' rowOrder-ascending sort should instead put
          // PR 2 first.
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open', rowOrder: 3 }),
          2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'merged', rowOrder: 1, mergedAt: '2026-01-01T00:00:00Z' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
      const needsAttentionSection = capturedSectionProps.find((p) => p.section.key === 'needsAttention');
      expect(needsAttentionSection.section.prs.map((entry) => entry.prNumber)).toEqual(['2', '1']);
    });

    test('given an unrelated re-render (toggling a section), when sections are rebuilt, then the shared grouping helper reuses its cache instead of re-sorting', () => {
      // Item 2 of the deferred-items follow-up (see REACT_MIGRATION_PLAN.md):
      // PrTableApp now calls the real, shared buildGroupedPrSections instead
      // of duplicating its filter/sort logic inline - this is the one
      // behavior that's actually new as a result (the shared helper's own
      // reference-equality cache, added in the Phase 5 residual slice, now
      // has a real consumer here). Toggling a section changes `openSections`
      // (a `sections` useMemo dependency) without changing `payload`, so
      // `entriesForRepo`'s entry objects are the exact same references -
      // the cache should hit and skip re-sorting entirely.
      // sortRowsByPrNumberDesc is the module-level jest.fn()-wrapped real
      // implementation set up at the top of this file (see the
      // jest.mock('../helpers/pr-row-sorting.helpers.ts', ...) call) -
      // clear it here so this test's own call count isn't polluted by
      // earlier tests in this describe block also exercising real sorting.
      sortRowsByPrNumberDesc.mockClear();

      const payload = {
        byPrNumber: {
          10: makeEntry({ prNumber: '10', repo: 'owner/repo', section: 'open' }),
          20: makeEntry({ prNumber: '20', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
      expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2); // open + draft, per section-grouping's own shape

      const openSectionBefore = capturedSectionProps.find((p) => p.section.key === 'open');
      capturedSectionProps.length = 0;
      React.act(() => {
        openSectionBefore.onToggleSection('open');
      });

      expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs.map((e) => e.prNumber)).toEqual(['20', '10']);
      // Not called again - the cache returned the previous result untouched.
      expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);
    });
  });

  test('given onToggleInsights is called for a PR, when toggled twice, then expandedInsights returns to its original state', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const { onToggleInsights } = capturedSectionProps[0];

    React.act(() => {
      onToggleInsights('1', 'open', 'owner/repo');
    });
    expect(capturedSectionProps.at(-1).expandedInsights['open:owner/repo:1']).toBe(true);

    React.act(() => {
      onToggleInsights('1', 'open', 'owner/repo');
    });
    expect(capturedSectionProps.at(-1).expandedInsights['open:owner/repo:1']).toBeFalsy();
  });

  test('given two repos with the same PR number in the same section, when one is toggled, then the other repo\'s insights row is unaffected (PR numbers are only unique within a repo)', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo-a', section: 'open' }),
        2: makeEntry({ prNumber: '1', repo: 'owner/repo-b', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const { onToggleInsights } = capturedSectionProps[0];

    React.act(() => {
      onToggleInsights('1', 'open', 'owner/repo-a');
    });

    const expandedInsights = capturedSectionProps.at(-1).expandedInsights;
    expect(expandedInsights['open:owner/repo-a:1']).toBe(true);
    expect(expandedInsights['open:owner/repo-b:1']).toBeFalsy();
  });

  test('given smart groups are available, when a PR needs attention, then it also appears in the smart-group section', () => {
    installSmartGroupHelpers();
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    renderPrTableApp({
      initialPayload: payload,
      selectedRepo: '',
      onCheckboxChange: () => {},
      onAckAction: () => {},
      needsAttention: { entryNeedsAttention: (entry) => entry.prNumber === '1' },
    });
    const flaggedSection = capturedSectionProps.find((p) => p.section.key === 'flagged');
    expect(flaggedSection).toBeDefined();
    expect(flaggedSection.section.prs.map((e) => e.prNumber)).toEqual(['1']);
  });

  test('given the narrower shouldShowNeedsAttention helper, when a row matches, then the section attentionCount reflects it', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    renderPrTableApp({
      initialPayload: payload,
      selectedRepo: '',
      onCheckboxChange: () => {},
      onAckAction: () => {},
      needsAttention: { shouldShowNeedsAttention: ({ row }) => row.number === '1' },
    });
    const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSection.section.attentionCount).toBe(1);
  });

  // Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // onCheckboxChange used to be a test-injected prop - PrTableApp now
  // builds the real handler itself (via useRowCheckboxActions(), reaching
  // the real pr-row-checkbox-actions.helpers.ts factory), so this drives
  // the real fetch call instead of a mock prop - same seam shift H.5 did
  // for onAckAction/onApplyLabel (there via postJson, here via fetch
  // directly, matching toggleInReviewForRow/toggleFlaggedForRow's own
  // fetchFn DI).
  test('given a checkbox change, when the real handler is called, then it posts the real /view-prs/ack request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, prData: {} }),
    });
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo' });

    await React.act(async () => {
      await capturedSectionProps[0].onCheckboxChange('1', 'inReview', true, 'owner/repo');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/ack',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'owner/repo', inReview: '1' }),
      }),
    );
    delete global.fetch;
  });

  describe('per-row busy spinner (Ack/Apply-Label/Update in flight)', () => {
    // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // onAckAction/onApplyLabel used to be test-injected props - PrTableApp
    // now builds the real handlers itself (via useAckLabelActions(),
    // reaching the real pr-ack-label-actions.helpers.ts factory), so these
    // tests drive the real postJson call instead of a mock prop. They
    // still reach PrSection as PrTableApp's own wrapper functions so it can
    // track which PR number is currently mid-request and light up that
    // row's PrNumberCell spinner (activePrNumbers).
    test('given onAckAction, when the wrapped handler is called, then it posts the real /view-prs/ack request', async () => {
      postJson.mockResolvedValue({ response: { ok: true, status: 200 }, result: { ok: true, prData: null } });
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {} });

      await React.act(async () => {
        await capturedSectionProps[0].onAckAction('1', false, 'owner/repo');
      });

      expect(postJson).toHaveBeenCalledWith('/view-prs/ack', { repo: 'owner/repo', ack: '1' });
    });

    // Guards against a real bug class: isAcked means "is this PR CURRENTLY
    // acked" so onAckAction can decide ack vs. clear - a caller that
    // instead passed the toggled target state would invert every request
    // (clicking "Ack" on an unacked PR sending ackClear instead of ack).
    test('given onAckAction with isAcked=true (currently acked), when called, then it posts an ackClear request, not ack', async () => {
      postJson.mockResolvedValue({ response: { ok: true, status: 200 }, result: { ok: true, prData: null } });
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {} });

      await React.act(async () => {
        await capturedSectionProps[0].onAckAction('1', true, 'owner/repo');
      });

      expect(postJson).toHaveBeenCalledWith('/view-prs/ack', { repo: 'owner/repo', ackClear: '1' });
    });

    test('given onApplyLabel, when the wrapped handler is called, then it posts the real /view-prs/labels/apply request', async () => {
      postJson.mockResolvedValue({ response: { ok: true, status: 200 }, result: { ok: true, prData: null } });
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {} });

      await React.act(async () => {
        await capturedSectionProps[0].onApplyLabel('1', 'bug', 'owner/repo');
      });

      expect(postJson).toHaveBeenCalledWith('/view-prs/labels/apply', {
        repo: 'owner/repo',
        label: 'bug',
        prNumbers: '1',
      });
    });

    test('given a PR whose Ack action is in flight, when checking activePrNumbers passed to PrSection, then that PR number is included while pending and removed once it resolves', async () => {
      let resolvePostJson;
      postJson.mockImplementation(() => new Promise((resolve) => { resolvePostJson = resolve; }));
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {} });

      let ackPromise;
      React.act(() => {
        ackPromise = capturedSectionProps[0].onAckAction('1', false, 'owner/repo');
      });
      expect(capturedSectionProps.at(-1).activePrNumbers).toContain('owner/repo::1');

      await React.act(async () => {
        resolvePostJson({ response: { ok: true, status: 200 }, result: { ok: true, prData: null } });
        await ackPromise;
      });
      expect(capturedSectionProps.at(-1).activePrNumbers).not.toContain('owner/repo::1');
    });

    test('given an Ack action whose request rejects, when it settles, then the PR is still removed from activePrNumbers', async () => {
      // runSingleAckRequest (pr-ack-label-actions.helpers.ts) catches a
      // rejected postJson internally and resolves to null - it never
      // rejects itself. This confirms withPrBusy's own finally still
      // clears the busy state for that real failure path.
      postJson.mockRejectedValue(new Error('boom'));
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {} });

      await React.act(async () => {
        await expect(capturedSectionProps[0].onAckAction('1', false, 'owner/repo')).resolves.toBeUndefined();
      });

      expect(capturedSectionProps.at(-1).activePrNumbers).not.toContain('owner/repo::1');
    });

    test('given no onUpdatePr-triggering action, when rendering, then a stable onUpdatePr function is passed to PrSection', () => {
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });
      expect(typeof capturedSectionProps[0].onUpdatePr).toBe('function');
    });

    // Bulk counterpart to the single-row wrappers above - covers
    // useAckLabelActions.tsx's own per-PR-loop wrapping of markPrBusy/
    // clearPrBusy (usePrActivityQueue()), marking every PR number in a
    // multi-PR batch request busy, not just the row a user directly
    // clicked.
    describe('markPrBusy/clearPrBusy (bulk Ack/Apply-Label from the Run & Filter tab)', () => {
      test('given the component is mounted, when marking several PR numbers busy, then all of them show up in activePrNumbers', () => {
        const payload = {
          byPrNumber: {
            1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
            2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
          },
        };
        renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });

        React.act(() => {
          capturedActivityQueue.markPrBusy('1', 'owner/repo');
          capturedActivityQueue.markPrBusy('2', 'owner/repo');
        });

        expect(capturedSectionProps.at(-1).activePrNumbers).toEqual(
          expect.arrayContaining(['owner/repo::1', 'owner/repo::2']),
        );
      });

      test('given several PR numbers already marked busy, when clearing them, then all of them are removed from activePrNumbers', () => {
        const payload = {
          byPrNumber: {
            1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
            2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
          },
        };
        renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });

        React.act(() => {
          capturedActivityQueue.markPrBusy('1', 'owner/repo');
          capturedActivityQueue.markPrBusy('2', 'owner/repo');
        });
        expect(capturedSectionProps.at(-1).activePrNumbers).toEqual(
          expect.arrayContaining(['owner/repo::1', 'owner/repo::2']),
        );

        React.act(() => {
          capturedActivityQueue.clearPrBusy('1', 'owner/repo');
          capturedActivityQueue.clearPrBusy('2', 'owner/repo');
        });
        expect(capturedSectionProps.at(-1).activePrNumbers).not.toEqual(
          expect.arrayContaining(['owner/repo::1', 'owner/repo::2']),
        );
      });
    });

    // Bulk counterpart's "queued, not yet started" phase - distinct from
    // the busy state above, for a chunked bulk request's PR numbers before
    // their own chunk's request has actually reached the network (see
    // pr-ack-label-actions.helpers.ts's own comment).
    describe('markPrQueued/clearPrQueued (chunked bulk Ack/Apply-Label)', () => {
      test('given the component is mounted, when marking several PR numbers queued, then all of them show up in queuedPrNumbers', () => {
        const payload = {
          byPrNumber: {
            1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
            2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
          },
        };
        renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });

        React.act(() => {
          capturedActivityQueue.markPrQueued('1', 'owner/repo');
          capturedActivityQueue.markPrQueued('2', 'owner/repo');
        });

        expect(capturedSectionProps.at(-1).queuedPrNumbers).toEqual(
          expect.arrayContaining(['owner/repo::1', 'owner/repo::2']),
        );
      });

      test('given several PR numbers already marked queued, when clearing them, then all of them are removed from queuedPrNumbers', () => {
        const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
        renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });

        React.act(() => {
          capturedActivityQueue.markPrQueued('1', 'owner/repo');
        });
        expect(capturedSectionProps.at(-1).queuedPrNumbers).toEqual(['owner/repo::1']);

        React.act(() => {
          capturedActivityQueue.clearPrQueued('1', 'owner/repo');
        });
        expect(capturedSectionProps.at(-1).queuedPrNumbers).not.toContain('owner/repo::1');
      });

      test('given a PR is both queued and busy, when checking queuedPrNumbers, then it is excluded (active wins over queued)', () => {
        const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
        renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });

        React.act(() => {
          capturedActivityQueue.markPrQueued('1', 'owner/repo');
          capturedActivityQueue.markPrBusy('1', 'owner/repo');
        });

        expect(capturedSectionProps.at(-1).activePrNumbers).toContain('owner/repo::1');
        expect(capturedSectionProps.at(-1).queuedPrNumbers).not.toContain('owner/repo::1');
      });
    });
  });

  describe('PR JSON modal', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, diffText: '' }),
      });
    });
    afterEach(() => {
      delete global.fetch;
    });

    test('given no PR has been requested, when rendering, then the PR JSON modal is not shown', () => {
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('given onViewJson is called (as PrActionsCell would via the {} button), when invoked, then opens the PR JSON modal for that PR', async () => {
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '' });
      const { onViewJson } = capturedSectionProps[0];

      React.act(() => {
        onViewJson({ prNumber: '1', repo: 'owner/repo' }, { number: '1' });
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('PR #1 (owner/repo)')).toBeInTheDocument();
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });

    test('given the PR JSON modal is open, when its close button is clicked, then it is dismissed', async () => {
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '' });
      const { onViewJson } = capturedSectionProps[0];

      React.act(() => {
        onViewJson({ prNumber: '1', repo: 'owner/repo' }, { number: '1' });
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Close PR JSON details' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('non-exclusive membership: a PR in a smart group still renders in its lifecycle section', () => {
    // Regression test for a real bug: a prior "fix" added row-level dedup
    // (pr-section-config.helpers.ts's now-removed excludeSmartGroupMembers)
    // that silently hid a PR's row from its lifecycle section whenever it
    // was already shown in a smart group above (e.g. "Open PRs I'm
    // Involved In") - contradicting the documented "non-exclusive
    // membership" design (README.md, "Smart group features": "A single PR
    // can appear in multiple smart groups AND its lifecycle section").
    // That's what actually produced "Open PRs" showing far fewer PRs than
    // "Open PRs I'm Involved In" reported, even though every PR in the
    // latter is, by definition, also an open PR.
    //
    // installSectionHelpers() above is a simplified test double that never
    // exercised the real pr-section-config.helpers.ts/PrTableApp
    // interaction, which is exactly why this regressed unnoticed - these
    // tests install the real helper module instead (jest.requireActual
    // bypasses the jest.mock() at the top of this file, which every other
    // describe block relies on).
    beforeEach(() => {
      const { createPrSectionConfigHelpers: realCreatePrSectionConfigHelpers } = jest.requireActual(
        '../helpers/pr-section-config.helpers.ts',
      );
      createPrSectionConfigHelpers.mockImplementation(realCreatePrSectionConfigHelpers);
      window.isInReviewEnabled = () => false;
    });

    test('given a PR that also belongs to a smart group, when computing the open section, then it still renders there (both totalCount and prs include it)', () => {
      installSmartGroupHelpers();
      // installSmartGroupHelpers' mock "Flagged" group is driven by
      // hasNeedsAttentionFlag, which PrTableApp wires to entryNeedsAttention -
      // use that as the smart-group membership hook for this test.
      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
          2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({
        initialPayload: payload,
        selectedRepo: 'owner/repo',
        onCheckboxChange: () => {},
        onAckAction: () => {},
        needsAttention: { entryNeedsAttention: (entry) => String(entry?.prNumber) === '1' },
      });

      const flaggedSection = capturedSectionProps.find((p) => p.section.key === 'flagged');
      const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
      expect(flaggedSection.section.prs.map((entry) => entry.prNumber)).toEqual(['1']);
      expect(openSection.section.totalCount).toBe(2);
      expect(openSection.section.prs).toHaveLength(2);
      expect(openSection.section.prs.map((entry) => entry.prNumber).sort()).toEqual(['1', '2']);
    });

    test('given no PR in a section belongs to any smart group, when computing that section, then totalCount matches prs.length', () => {
      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
          2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({
        initialPayload: payload,
        selectedRepo: 'owner/repo',
        onCheckboxChange: () => {},
        onAckAction: () => {},
        needsAttention: { entryNeedsAttention: () => false },
      });

      const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
      expect(openSection.section.totalCount).toBe(2);
      expect(openSection.section.prs).toHaveLength(2);
    });
  });

  // Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // state/useNavigateToPrInTable.tsx (AutoRenderBlockedLinks.jsx) dispatches
  // this same event with a focusUnsaved detail flag now - this suite's own
  // PrSection mock (top of file) means the real .pr-link/.pr-notes-save
  // markup these assertions target never actually renders through
  // PrTableApp itself, so each test inserts a standalone element matching
  // the same selectors the real row/Notes-section markup would produce
  // (PrNumberCell.jsx/NotesSection.jsx), directly into document.body -
  // this still exercises PrTableApp's own effect logic for real (a global
  // document.querySelector, not scoped to its own container), just without
  // needing the full unmocked render tree.
  describe('pr-navigate-to-insights (scroll/focus after insights-row expansion)', () => {
    afterEach(() => {
      document.body.querySelectorAll('[data-test-standalone]').forEach((el) => el.remove());
    });

    test('given focusUnsaved and a real unsaved Notes save button in the DOM, when the event fires, then that button ends up focused', async () => {
      const notesSection = document.createElement('div');
      notesSection.className = 'pr-notes-section';
      notesSection.setAttribute('data-pr-number', '1');
      notesSection.setAttribute('data-test-standalone', 'true');
      const saveButton = document.createElement('button');
      saveButton.className = 'pr-notes-save';
      notesSection.appendChild(saveButton);
      document.body.appendChild(notesSection);

      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({
        initialPayload: payload,
        selectedRepo: 'owner/repo',
        onCheckboxChange: () => {},
        onAckAction: () => {},
      });

      fireEvent(
        window,
        new CustomEvent('pr-navigate-to-insights', { detail: { prNumber: '1', focusUnsaved: true } }),
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(saveButton);
      });
    });

    test('given no focusUnsaved, when the event fires, then the row-link element ends up focused instead', async () => {
      const cell = document.createElement('div');
      cell.setAttribute('data-pr-number', '1');
      cell.setAttribute('data-repo', 'owner/repo');
      cell.setAttribute('data-test-standalone', 'true');
      const link = document.createElement('a');
      link.className = 'pr-link';
      link.href = 'https://github.com/owner/repo/pull/1';
      cell.appendChild(link);
      document.body.appendChild(cell);

      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({
        initialPayload: payload,
        selectedRepo: 'owner/repo',
        onCheckboxChange: () => {},
        onAckAction: () => {},
      });

      fireEvent(window, new CustomEvent('pr-navigate-to-insights', { detail: { prNumber: '1' } }));

      await waitFor(() => {
        expect(document.activeElement).toBe(link);
      });
    });
  });
});
