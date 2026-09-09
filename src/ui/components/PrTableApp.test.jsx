/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
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

const { PrTableApp } = require('./PrTableApp');

function installSectionHelpers() {
  // Minimal stand-in for the real vanilla helpers: one lifecycle section per
  // grouped.<key> array, in a fixed order, mirroring the shape
  // pr-section-config.helpers.js actually returns.
  window.ViewPrsSectionConfigHelpers = {
    createPrSectionConfigHelpers: () => ({
      buildPrSectionConfigs: ({ grouped, smartGroups }) => {
        const lifecycleConfigs = ['open', 'draft', 'merged', 'closed'].map((key) => ({
          sectionKey: key,
          title: key,
          rows: grouped[key] || [],
          isSmartGroup: false,
          dateHeader: 'LAST ACTIVITY',
          isOpen: false,
        }));
        const smartGroupConfigs = smartGroups
          ? Object.entries(smartGroups).map(([key, group]) => ({
              sectionKey: key,
              title: group.title,
              rows: group.rows || [],
              isSmartGroup: true,
              dateHeader: 'LAST ACTIVITY',
              isOpen: false,
            }))
          : [];
        return [...smartGroupConfigs, ...lifecycleConfigs];
      },
    }),
  };
}

function installSmartGroupHelpers() {
  window.ViewPrsSmartGroupsHelpers = {
    createPrSmartGroupsHelpers: ({ hasNeedsAttentionFlag }) => ({
      buildSmartGroupConfigs: () => ({ flagged: { title: 'Flagged', defaultOpen: false } }),
      applySmartGroups: (allEntries) => ({
        flagged: { title: 'Flagged', rows: allEntries.filter((entry) => hasNeedsAttentionFlag(entry)) },
      }),
    }),
  };
}

function clearWindowHelpers() {
  delete window.ViewPrsSectionConfigHelpers;
  delete window.ViewPrsSmartGroupsHelpers;
  delete window.entryNeedsAttention;
  delete window.getNeedsAttentionConfig;
  delete window.countPendingThreadComments;
  delete window.shouldShowNeedsAttention;
  delete window.updateReactPrTable;
}

function makeEntry({ prNumber, repo, section }) {
  return { prNumber, repo, section, data: { number: prNumber, viewerLogin: '' } };
}

describe('PrTableApp', () => {
  beforeEach(() => {
    capturedSectionProps.length = 0;
    installSectionHelpers();
  });
  afterEach(clearWindowHelpers);

  test('given no payload, when rendering, then shows the loading state instead of any sections', () => {
    render(<PrTableApp initialPayload={null} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(screen.getByText('Loading Pull Requests...')).toBeInTheDocument();
    expect(screen.queryByTestId('section')).not.toBeInTheDocument();
  });

  test('given a payload but no window.ViewPrsSectionConfigHelpers, when rendering, then still shows the loading state', () => {
    clearWindowHelpers(); // no section helpers installed for this test
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'o/r', section: 'open' }) } };
    render(<PrTableApp initialPayload={payload} selectedRepo="o/r" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(screen.getByText('Loading Pull Requests...')).toBeInTheDocument();
  });

  test('given entries for one repo, when no selectedRepo is passed, then effectiveRepo falls back to the first repo found in the payload', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'closed' }),
      },
    };
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(capturedSectionProps[0].repo).toBe('owner/repo');
  });

  test('given entries for multiple repos, when selectedRepo is passed, then only that repo\'s entries populate the sections', () => {
    const payload = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo-a', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo-b', section: 'open' }),
      },
    };
    render(<PrTableApp initialPayload={payload} selectedRepo="owner/repo-b" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSection.section.prs).toHaveLength(1);
    expect(openSection.section.prs[0].repo).toBe('owner/repo-b');
  });

  test('given flaggedByRepo/inReviewByRepo/ackByRepo for the effective repo, when getPrFlags is called, then reflects that repo\'s state', () => {
    const payload = {
      byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) },
      flaggedByRepo: { 'owner/repo': { 1: true } },
      inReviewByRepo: { 'owner/repo': {} },
      ackByRepo: { 'owner/repo': { 1: '2026-01-01T00:00:00Z' } },
    };
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    const flags = capturedSectionProps[0].getPrFlags('1');
    expect(flags).toEqual({ isFlagged: true, isInReview: false, isAcknowledged: true });
  });

  test('given getPrFlags for a repo with no stored flags at all, when called, then returns all-false rather than throwing', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(capturedSectionProps[0].getPrFlags('1')).toEqual({ isFlagged: false, isInReview: false, isAcknowledged: false });
  });

  test('given a fresh initialPayload prop on re-render, when the bridge delivers it via root.render (not setState), then the new payload is reflected', () => {
    const payloadA = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    const payloadB = {
      byPrNumber: {
        1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }),
        2: makeEntry({ prNumber: '2', repo: 'owner/repo', section: 'open' }),
      },
    };
    const { rerender } = render(<PrTableApp initialPayload={payloadA} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(1);

    capturedSectionProps.length = 0;
    rerender(<PrTableApp initialPayload={payloadB} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    // The prop-sync useEffect (see PrTableApp.jsx) commits one render with the
    // still-stale state before its setPayload triggers a second render with
    // the new payload — so take the *last* capture for this section, not the
    // first.
    const openCaptures = capturedSectionProps.filter((p) => p.section.key === 'open');
    expect(openCaptures.at(-1).section.prs).toHaveLength(2);
  });

  test('given the exact same initialPayload object reference on re-render, when nothing changed, then does not clobber payload state', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    const { rerender } = render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    capturedSectionProps.length = 0;
    rerender(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    expect(capturedSectionProps.find((p) => p.section.key === 'open').section.prs).toHaveLength(1);
  });

  test('given onDataRefresh is called by a descendant (e.g. after a Notes save), when invoked with a new payload, then state updates to it', () => {
    const payloadA = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    render(<PrTableApp initialPayload={payloadA} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
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
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    const openSectionBefore = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSectionBefore.isOpen).toBe(false); // defaultOpen: false from the mocked helper

    capturedSectionProps.length = 0;
    React.act(() => {
      openSectionBefore.onToggleSection('open');
    });
    expect(capturedSectionProps.find((p) => p.section.key === 'open').isOpen).toBe(true);
  });

  test('given onToggleInsights is called for a PR, when toggled twice, then expandedInsights returns to its original state', () => {
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    const { onToggleInsights } = capturedSectionProps[0];

    React.act(() => {
      onToggleInsights('1', 'open');
    });
    expect(capturedSectionProps.at(-1).expandedInsights['open:1']).toBe(true);

    React.act(() => {
      onToggleInsights('1', 'open');
    });
    expect(capturedSectionProps.at(-1).expandedInsights['open:1']).toBeFalsy();
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
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
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
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={() => {}} onAckAction={() => {}} />);
    const openSection = capturedSectionProps.find((p) => p.section.key === 'open');
    expect(openSection.section.attentionCount).toBe(1);
  });

  test('given onCheckboxChange/onAckAction props, when passed through, then the same functions reach PrSection unchanged', () => {
    const onCheckboxChange = jest.fn();
    const onAckAction = jest.fn();
    const payload = { byPrNumber: { 1: makeEntry({ prNumber: '1', repo: 'owner/repo', section: 'open' }) } };
    render(<PrTableApp initialPayload={payload} selectedRepo="" onCheckboxChange={onCheckboxChange} onAckAction={onAckAction} />);
    expect(capturedSectionProps[0].onCheckboxChange).toBe(onCheckboxChange);
    expect(capturedSectionProps[0].onAckAction).toBe(onAckAction);
  });
});
