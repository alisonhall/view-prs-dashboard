/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { FilterOptionsProvider } = require('./FilterOptionsProvider');
const { useFilterOptions } = require('../state/FilterOptionsContext');
const { PrDataProvider } = require('../state/PrDataProvider');

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
