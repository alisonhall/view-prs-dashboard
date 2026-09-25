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

// ES module cleanup (see REACT_MIGRATION_PLAN.md): pr-section-config.helpers.js/
// pr-smart-groups.helpers.js are real ES modules now, imported directly by
// PrTableApp.jsx instead of read off window.ViewPrsSectionConfigHelpers/
// window.ViewPrsSmartGroupsHelpers - these tests used to swap window
// globals per-test to control their behavior; jest.mock + mockImplementation
// is the equivalent for a real import.
jest.mock('../helpers/pr-section-config.helpers.js', () => ({
  createPrSectionConfigHelpers: jest.fn(),
}));
jest.mock('../helpers/pr-smart-groups.helpers.js', () => ({
  createPrSmartGroupsHelpers: jest.fn(),
}));

const { PrTableApp } = require('./PrTableApp');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrSectionConfigHelpers } = require('../helpers/pr-section-config.helpers.js');
const { createPrSmartGroupsHelpers } = require('../helpers/pr-smart-groups.helpers.js');

// Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
// PrTableApp reads payload/selectedRepo/visiblePrNumbers from
// <PrDataProvider /> now, not as direct props - this wraps every render the
// same way mountReactPrTable (react-app.jsx) really does. Updates after the
// initial render go through window.updateReactPrTable (the Provider's own
// bridge), not a `rerender` with new props - see the "delivers a fresh
// payload" test below for the real post-mount update path.
const renderPrTableApp = ({ initialPayload, selectedRepo, visiblePrNumbers, ...tableProps } = {}) =>
  render(
    <PrDataProvider
      initialPayload={initialPayload}
      initialSelectedRepo={selectedRepo}
      initialVisiblePrNumbers={visiblePrNumbers}
    >
      <PrTableApp {...tableProps} />
    </PrDataProvider>,
  );

function installSectionHelpers() {
  // Minimal stand-in for the real vanilla helpers: one lifecycle section per
  // grouped.<key> array, in a fixed order, mirroring the shape
  // pr-section-config.helpers.js actually returns.
  createPrSectionConfigHelpers.mockImplementation(
    // Mirrors pr-section-config.helpers.js's real safe-default behavior: if
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
  delete window.entryNeedsAttention;
  delete window.getNeedsAttentionConfig;
  delete window.isInReviewEnabled;
  delete window.countPendingThreadComments;
  delete window.shouldShowNeedsAttention;
  delete window.updateReactPrTable;
  delete window.sortRowsByPrNumberDesc;
  delete window.sortRowsByDateFieldDesc;
  delete window.normalizeRows;
}

// Real equivalents of index.page.js's row-sorting functions (mirrored here
// rather than requiring the whole vanilla script), so tests can verify
// PrTableApp actually wires these in rather than leaving rows unsorted.
function installSortHelpers() {
  window.sortRowsByPrNumberDesc = (rows) =>
    rows.sort((a, b) => Number(a?.data?.number || a?.prNumber || 0) < Number(b?.data?.number || b?.prNumber || 0) ? 1 : -1);
  window.sortRowsByDateFieldDesc = (rows, fieldName) =>
    rows.sort((a, b) => {
      const dateA = Date.parse(String(a?.data?.[fieldName] || '')) || Number.NEGATIVE_INFINITY;
      const dateB = Date.parse(String(b?.data?.[fieldName] || '')) || Number.NEGATIVE_INFINITY;
      if (dateA !== dateB) return dateB - dateA;
      return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
    });
  window.normalizeRows = (rows) =>
    rows.sort((a, b) => {
      const orderA = Number.isFinite(Number(a?.rowOrder)) ? Number(a.rowOrder) : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b?.rowOrder)) ? Number(b.rowOrder) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return Number(b?.prNumber || 0) - Number(a?.prNumber || 0);
    });
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
  // pr-section-config.helpers.js directly - a real ES import always
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

  test('given window.updateReactPrTable delivers a fresh payload (the real post-mount update path - see PrDataProvider.jsx, Track C slice C2c), when called, then the new payload is reflected', () => {
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
      window.updateReactPrTable(payloadB);
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(2);
  });

  test('given window.updateReactPrTable is called again with the same payload reference, when nothing actually changed, then the content is still correct', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    capturedSectionProps.length = 0;
    React.act(() => {
      window.updateReactPrTable(payload);
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

  test('given window.isInReviewEnabled(entry.data) is true but window.entryNeedsAttention is false, when smart groups are built, then the entry does NOT count as needing attention', () => {
    // Regression test: checkNeedsAttention previously OR'd in
    // window.isInReviewEnabled(entry?.data), so manually checking the "In
    // Review" checkbox on a PR made it show the Needs Attention icon and
    // join the Needs Attention smart group even with no actual unreviewed
    // activity (entryNeedsAttention false). "In Review" is a separate,
    // manually-set flag (see isInReviewEnabled/AlwaysShowInReviewCheckbox)
    // and must stay independent of needs-attention - checkNeedsAttention
    // should delegate to window.entryNeedsAttention only.
    window.entryNeedsAttention = () => false;
    window.getNeedsAttentionConfig = () => ({});
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
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });

    expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(0);
  });

  test('given window.isInReviewEnabled(entry.data) is false but window.entryNeedsAttention is true, when smart groups are built, then the entry still counts as needing attention', () => {
    // Positive control for the regression test above: removing the
    // isInReviewEnabled OR must not also break the real attention signal.
    window.entryNeedsAttention = () => true;
    window.getNeedsAttentionConfig = () => ({});
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
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });

    expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(1);
  });

  describe('attention config live-update', () => {
    test('given the NO_ACTIVITY handling select (or any other "Needs Attention rules" control) changes, when no section is toggled, then the Needs Attention smart group\'s membership updates immediately', () => {
      // Regression test: these controls live in vanilla DOM, not React
      // state, so the `sections` useMemo previously had no dependency that
      // changed when they did — smart-group membership only refreshed once
      // something else (e.g. toggling a section, which changes
      // `openSections`) happened to invalidate the memo, even though each
      // row's own attention-cell icon (computed fresh on every PrTable
      // render, not memoized) already reflected the change immediately.
      let attentionFlag = false;
      window.entryNeedsAttention = () => attentionFlag;
      window.getNeedsAttentionConfig = () => ({});
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
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });

      expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(0);

      const select = document.createElement('select');
      select.id = 'attention-no-activity-mode';
      document.body.appendChild(select);

      attentionFlag = true;
      capturedSectionProps.length = 0;
      React.act(() => {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(capturedSectionProps.find((p) => p.section.key === 'needsAttention').section.prs).toHaveLength(1);

      document.body.removeChild(select);
    });

    test('given a change event on an unrelated control, when no section is toggled, then the Needs Attention smart group does not needlessly recompute', () => {
      let attentionFlag = false;
      window.entryNeedsAttention = () => attentionFlag;
      window.getNeedsAttentionConfig = () => ({});
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
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });

      const unrelated = document.createElement('input');
      unrelated.id = 'some-unrelated-control';
      document.body.appendChild(unrelated);

      attentionFlag = true;
      capturedSectionProps.length = 0;
      React.act(() => {
        unrelated.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // No re-render was triggered by this unrelated control, so nothing was
      // re-captured — the memoized section list (built while attentionFlag
      // was still false) is unaffected.
      expect(capturedSectionProps).toHaveLength(0);

      document.body.removeChild(unrelated);
    });
  });

  describe('row sorting', () => {
    beforeEach(installSortHelpers);

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
      // installSortHelpers() installs plain (non-spy) functions; wrap with
      // jest.fn() here, preserving the real sorting behavior, so this test
      // alone can count calls without affecting the other tests in this
      // describe block.
      window.sortRowsByPrNumberDesc = jest.fn(window.sortRowsByPrNumberDesc);

      const payload = {
        byPrNumber: {
          10: makeEntry({ prNumber: '10', repo: 'owner/repo', section: 'open' }),
          20: makeEntry({ prNumber: '20', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
      expect(window.sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2); // open + draft, per section-grouping's own shape

      const openSectionBefore = capturedSectionProps.find((p) => p.section.key === 'open');
      capturedSectionProps.length = 0;
      React.act(() => {
        openSectionBefore.onToggleSection('open');
      });

      expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs.map((e) => e.prNumber)).toEqual(['20', '10']);
      // Not called again - the cache returned the previous result untouched.
      expect(window.sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);
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
    window.entryNeedsAttention = (entry) => entry.prNumber === '1';
    window.getNeedsAttentionConfig = () => ({});
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const flaggedSection = capturedSectionProps.find((p) => p.section.key === 'flagged');
    expect(flaggedSection).toBeDefined();
    expect(flaggedSection.section.prs.map((e) => e.prNumber)).toEqual(['1']);
  });

  test('given the narrower shouldShowNeedsAttention helper, when a row matches, then the section attentionCount reflects it', () => {
    window.shouldShowNeedsAttention = ({ row }) => row.number === '1';
    window.getNeedsAttentionConfig = () => ({});
    window.countPendingThreadComments = () => 0;
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: () => {}, onAckAction: () => {} });
    const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSection.section.attentionCount).toBe(1);
  });

  test('given an onCheckboxChange prop, when passed through, then the same function reaches PrSection unchanged', () => {
    const onCheckboxChange = jest.fn();
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    renderPrTableApp({ initialPayload: payload, selectedRepo: '', onCheckboxChange: onCheckboxChange, onAckAction: () => {}, onApplyLabel: () => {} });
    expect(capturedSectionProps[0].onCheckboxChange).toBe(onCheckboxChange);
  });

  describe('per-row busy spinner (Ack/Apply-Label/Update in flight)', () => {
    // onAckAction/onApplyLabel/onUpdatePr reach PrSection as PrTableApp's
    // own wrapper functions (not the raw props unchanged) so it can track
    // which PR number is currently mid-request and light up that row's
    // PrNumberCell spinner (activePrNumbers) - these tests call through the
    // wrapper the same way PrActionsCell does, and assert both that the
    // original callback still runs with the same arguments and that the
    // row's busy state is set/cleared around it.
    test('given onAckAction, when the wrapped handler is called, then the underlying callback still runs with the same arguments', async () => {
      const onAckAction = jest.fn().mockResolvedValue(undefined);
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: onAckAction, onApplyLabel: () => {} });

      await React.act(async () => {
        await capturedSectionProps[0].onAckAction('1', false, 'owner/repo');
      });

      expect(onAckAction).toHaveBeenCalledWith('1', false, 'owner/repo');
    });

    test('given onApplyLabel, when the wrapped handler is called, then the underlying callback still runs with the same arguments', async () => {
      const onApplyLabel = jest.fn().mockResolvedValue(undefined);
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: onApplyLabel });

      await React.act(async () => {
        await capturedSectionProps[0].onApplyLabel('1', 'bug', 'owner/repo');
      });

      expect(onApplyLabel).toHaveBeenCalledWith('1', 'bug', 'owner/repo');
    });

    test('given a PR whose Ack action is in flight, when checking activePrNumbers passed to PrSection, then that PR number is included while pending and removed once it resolves', async () => {
      let resolveAck;
      const onAckAction = jest.fn(() => new Promise((resolve) => { resolveAck = resolve; }));
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: onAckAction, onApplyLabel: () => {} });

      let ackPromise;
      React.act(() => {
        ackPromise = capturedSectionProps[0].onAckAction('1', false, 'owner/repo');
      });
      expect(capturedSectionProps.at(-1).activePrNumbers).toContain('owner/repo::1');

      await React.act(async () => {
        resolveAck();
        await ackPromise;
      });
      expect(capturedSectionProps.at(-1).activePrNumbers).not.toContain('owner/repo::1');
    });

    test('given an Ack action that rejects, when it settles, then the PR is still removed from activePrNumbers', async () => {
      const onAckAction = jest.fn().mockRejectedValue(new Error('boom'));
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: onAckAction, onApplyLabel: () => {} });

      await React.act(async () => {
        await expect(capturedSectionProps[0].onAckAction('1', false, 'owner/repo')).rejects.toThrow('boom');
      });

      expect(capturedSectionProps.at(-1).activePrNumbers).not.toContain('owner/repo::1');
    });

    test('given no onUpdatePr-triggering action, when rendering, then a stable onUpdatePr function is passed to PrSection', () => {
      const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {}, onApplyLabel: () => {} });
      expect(typeof capturedSectionProps[0].onUpdatePr).toBe('function');
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
    // (pr-section-config.helpers.js's now-removed excludeSmartGroupMembers)
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
    // exercised the real pr-section-config.helpers.js/PrTableApp
    // interaction, which is exactly why this regressed unnoticed - these
    // tests install the real helper module instead (jest.requireActual
    // bypasses the jest.mock() at the top of this file, which every other
    // describe block relies on).
    beforeEach(() => {
      const { createPrSectionConfigHelpers: realCreatePrSectionConfigHelpers } = jest.requireActual(
        '../helpers/pr-section-config.helpers.js',
      );
      createPrSectionConfigHelpers.mockImplementation(realCreatePrSectionConfigHelpers);
      window.entryNeedsAttention = () => false;
      window.getNeedsAttentionConfig = () => ({});
      window.isInReviewEnabled = () => false;
      window.countPendingThreadComments = () => 0;
      window.shouldShowNeedsAttention = () => false;
    });

    test('given a PR that also belongs to a smart group, when computing the open section, then it still renders there (both totalCount and prs include it)', () => {
      installSmartGroupHelpers();
      installSortHelpers();
      // installSmartGroupHelpers' mock "Flagged" group is driven by
      // hasNeedsAttentionFlag, which PrTableApp wires to
      // window.entryNeedsAttention - use that as the smart-group membership
      // hook for this test.
      window.entryNeedsAttention = (entry) => String(entry?.prNumber) === '1';

      const payload = {
        byPrNumber: {
          1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
          2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
        },
      };
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {} });

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
      renderPrTableApp({ initialPayload: payload, selectedRepo: 'owner/repo', onCheckboxChange: () => {}, onAckAction: () => {} });

      const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
      expect(openSection.section.totalCount).toBe(2);
      expect(openSection.section.prs).toHaveLength(2);
    });
  });
});
