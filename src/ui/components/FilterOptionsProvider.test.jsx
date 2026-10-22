/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');

// ROADMAP.md follow-up (Phase 5, "Performance Validation"): spies on the
// real extractRowLabelNames (jest.requireActual, not a fake) to prove the
// new per-entry cache actually skips re-deriving an unchanged entry on a
// second render - not just that the rendered options still come out
// correct (the 4 tests below already proved that before this change).
jest.mock('../helpers/pr-filter-label-extraction.helpers.js', () => {
  const real = jest.requireActual('../helpers/pr-filter-label-extraction.helpers.js');
  return { ...real, extractRowLabelNames: jest.fn(real.extractRowLabelNames) };
});
const { extractRowLabelNames } = require('../helpers/pr-filter-label-extraction.helpers.js');

const { FilterOptionsProvider } = require('./FilterOptionsProvider');
const { useFilterOptions } = require('../state/FilterOptionsContext');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): writes
// PrDataProvider through this probe, not window.updateReactPrTable.
const prDataProbe = createPrDataProbe();

function OptionsProbe() {
  const options = useFilterOptions();
  return (
    <ul>
      {Object.entries(options).map(([key, list]) => (
        <li key={key}>
          {key}: {list.map((option) => `${option.value}|${option.label}`).join(', ')}
        </li>
      ))}
    </ul>
  );
}

const buildEntry = (overrides = {}) => ({
  prNumber: '1',
  repo: 'owner/repo',
  ...overrides,
  data: {
    number: '1',
    authorLogin: 'octocat',
    author: 'The Octocat',
    labels: [],
    ...overrides.data,
  },
});

const renderProbe = ({ byPrNumber, selectedRepo, actorsMap } = {}) =>
  render(
    <PrDataProvider
      initialPayload={{ byPrNumber: byPrNumber || {}, actorsMap: actorsMap || {} }}
      initialSelectedRepo={selectedRepo || ''}
    >
      <FilterOptionsProvider>
        <OptionsProbe />
      </FilterOptionsProvider>
    </PrDataProvider>,
  );

describe('FilterOptionsProvider', () => {
  test('given no PrDataProvider payload loaded, when rendering, then every option list is empty', () => {
    renderProbe();

    expect(screen.getByText('labelOptions:')).toBeInTheDocument();
    expect(screen.getByText('authorOptions:')).toBeInTheDocument();
  });

  test('given entries with labels/authors, when rendering, then the label and author lists are derived, deduped, and sorted', () => {
    const entryA = buildEntry({
      prNumber: '1',
      data: { number: '1', authorLogin: 'bob', author: 'Bob', labels: [{ name: 'bug' }, { name: 'ui' }] },
    });
    const entryB = buildEntry({
      prNumber: '2',
      data: { number: '2', authorLogin: 'alice', author: 'Alice', labels: [{ name: 'bug' }] },
    });

    renderProbe({ byPrNumber: { 1: entryA, 2: entryB } });

    expect(screen.getByText('labelOptions: bug|bug, ui|ui')).toBeInTheDocument();
    expect(screen.getByText('excludeLabelOptions: bug|bug, ui|ui')).toBeInTheDocument();
    expect(screen.getByText('authorOptions: alice|Alice, bob|Bob')).toBeInTheDocument();
  });

  test('given entries across multiple repos and a selectedRepo, when rendering, then options are scoped to that repo only', () => {
    const entryA = buildEntry({
      prNumber: '1',
      repo: 'owner/repo-a',
      data: { number: '1', authorLogin: 'alice', author: 'Alice', labels: [{ name: 'repo-a-label' }] },
    });
    const entryB = buildEntry({
      prNumber: '2',
      repo: 'owner/repo-b',
      data: { number: '2', authorLogin: 'bob', author: 'Bob', labels: [{ name: 'repo-b-label' }] },
    });

    renderProbe({ byPrNumber: { 1: entryA, 2: entryB }, selectedRepo: 'owner/repo-a' });

    expect(screen.getByText('labelOptions: repo-a-label|repo-a-label')).toBeInTheDocument();
    expect(screen.getByText('authorOptions: alice|Alice')).toBeInTheDocument();
  });

  test('given a re-render with the same entry object references (a poll tick with no real changes), when rendering again, then entry-derived values are not recomputed', () => {
    extractRowLabelNames.mockClear();
    const entryA = buildEntry({
      prNumber: '1',
      data: { number: '1', authorLogin: 'bob', author: 'Bob', labels: [{ name: 'bug' }] },
    });
    const byPrNumber = { 1: entryA };

    render(
      <PrDataProvider initialPayload={{ byPrNumber, actorsMap: {} }} initialSelectedRepo="">
        <prDataProbe.PrDataProbe />
        <FilterOptionsProvider>
          <OptionsProbe />
        </FilterOptionsProvider>
      </PrDataProvider>,
    );
    expect(extractRowLabelNames).toHaveBeenCalledTimes(1);

    // A new top-level payload object pushed through the real update path
    // (applyFreshTablePayload, PrDataProvider's own Context setter) -
    // mimicking a real poll tick - but entryA is still the exact same
    // object reference, matching mergeDataDeltaPayload's own shallow
    // merge, which keeps an unchanged entry's reference stable.
    const nextPayload = { byPrNumber: { ...byPrNumber }, actorsMap: {} };
    act(() => {
      prDataProbe.applyFreshTablePayload(nextPayload);
    });

    // Guard against a vacuous pass: the update really landed.
    expect(prDataProbe.readPayload()).toBe(nextPayload);
    expect(extractRowLabelNames).toHaveBeenCalledTimes(1);
  });

  test('given an actorsMap, when rendering, then the 4 actor-based lists share one identical derivation', () => {
    renderProbe({ actorsMap: { zed: 'Zed Actor', amy: 'Amy Actor' } });

    const expected =
      'amy|Amy Actor, zed|Zed Actor';
    expect(screen.getByText(`authorThreadResolutionAllowOptions: ${expected}`)).toBeInTheDocument();
    expect(screen.getByText(`authorThreadResolutionDenyOptions: ${expected}`)).toBeInTheDocument();
    expect(screen.getByText(`changeFilterIgnoreCommentAuthorsOptions: ${expected}`)).toBeInTheDocument();
    expect(screen.getByText(`changeFilterIgnoreReviewAuthorsOptions: ${expected}`)).toBeInTheDocument();
  });
});
