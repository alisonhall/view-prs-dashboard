/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsSelector } = require('./AuthorInsightsSelector');
const { PrDataProvider } = require('../state/PrDataProvider');

const OPTIONS = [
  { login: 'octocat', name: 'The Octocat' },
  { login: 'hubot', name: 'Hubot' },
];

const renderSelector = ({ selectedAuthorLogin = '', onChange = () => {}, hasRows = true } = {}) =>
  render(
    <PrDataProvider initialPayload={{ byPrNumber: hasRows ? { 1: {} } : {} }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorInsightsSelector onChange={onChange} />
    </PrDataProvider>,
  );

describe('AuthorInsightsSelector', () => {
  beforeEach(() => {
    window.buildAuthorInsightsEntries = () => OPTIONS;
  });

  afterEach(() => {
    delete window.buildAuthorInsightsEntries;
  });

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
    window.buildAuthorInsightsEntries = () => [];
    renderSelector({});
    expect(screen.getByText('No authors found in the current local data scope.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
  });

  test('given a user selects a different author, when selecting, then onChange fires and the Context-driven value updates', async () => {
    const onChange = jest.fn((login) => window.updateReactSelectedAuthorLogin(login));
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat', onChange });

    await user.selectOptions(screen.getByLabelText('Author'), 'hubot');

    expect(onChange).toHaveBeenCalledWith('hubot');
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
});
