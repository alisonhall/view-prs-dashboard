/** @jest-environment jsdom */

const { render, screen, act, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsSelector } = require('./AuthorInsightsSelector');
const { PrDataProvider } = require('../state/PrDataProvider');
const { usePrData } = require('../state/PrDataContext');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');

const OPTIONS = [
  { login: 'octocat', name: 'The Octocat' },
  { login: 'hubot', name: 'Hubot' },
];

let latestSelectedAuthorLogin;
function SelectedAuthorLoginProbe() {
  latestSelectedAuthorLogin = usePrData().selectedAuthorLogin;
  return null;
}

const renderSelector = ({ selectedAuthorLogin = '', hasRows = true, buildAuthorInsightsEntries = () => OPTIONS } = {}) =>
  render(
    <PrDataProvider initialPayload={{ byPrNumber: hasRows ? { 1: {} } : {} }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, buildAuthorInsightsEntries }}>
        <SelectedAuthorLoginProbe />
        <AuthorInsightsSelector />
      </AuthorInsightsContext.Provider>
    </PrDataProvider>,
  );

describe('AuthorInsightsSelector', () => {
  test('given options, when rendering, then the select shows each author by display name', () => {
    renderSelector({ selectedAuthorLogin: 'octocat' });

    const select = screen.getByLabelText('Author');
    expect(select).toHaveValue('octocat');
    expect(screen.getByRole('option', { name: 'The Octocat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hubot' })).toBeInTheDocument();
  });

  test('given no local rows, when rendering, then the "No local rows" empty-state message is shown instead of the select (even if buildAuthorInsightsEntries would otherwise return options)', () => {
    renderSelector({ hasRows: false });
    expect(screen.getByText('No local rows available for author insights.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
  });

  test('given no options from buildAuthorInsightsEntries, when rendering, then the "No authors found" empty-state message is shown instead of the select', () => {
    renderSelector({ buildAuthorInsightsEntries: () => [] });
    expect(screen.getByText('No authors found in the current local data scope.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
  });

  // Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): selecting a different author now writes
  // setSelectedAuthorLogin (PrDataProvider.jsx) directly - no more
  // window.selectAuthorInsightsAuthor bridge/onChange prop round-trip.
  test('given a user selects a different author, when selecting, then the Context-driven value updates', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    await user.selectOptions(screen.getByLabelText('Author'), 'hubot');

    expect(screen.getByLabelText('Author')).toHaveValue('hubot');
  });

  test('given a change to the selected author in Context, when it updates externally, then the select reflects the new value', () => {
    renderSelector({ selectedAuthorLogin: 'octocat' });
    expect(screen.getByLabelText('Author')).toHaveValue('octocat');

    act(() => {
      window.updateReactSelectedAuthorLogin('hubot');
    });

    expect(screen.getByLabelText('Author')).toHaveValue('hubot');
  });

  // Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): this component now owns the validation/fallback rule
  // pr-author-insights.component.js's renderAuthorInsights used to own
  // (resolveValidAuthorLogin) - these 2 tests cover the cases that used
  // to only be reachable through that deleted vanilla pipeline.
  test('given the previously selected author no longer exists in the current options, when rendering, then it falls back to the first option', async () => {
    renderSelector({ selectedAuthorLogin: 'someone-removed' });

    await waitFor(() => expect(screen.getByLabelText('Author')).toHaveValue('octocat'));
  });

  test('given no options at all, when the previously selected author existed, then it clears to empty in Context (not just the rendered empty state)', async () => {
    renderSelector({ selectedAuthorLogin: 'octocat', buildAuthorInsightsEntries: () => [] });

    expect(screen.getByText('No authors found in the current local data scope.')).toBeInTheDocument();
    await waitFor(() => expect(latestSelectedAuthorLogin).toBe(''));
  });
});
