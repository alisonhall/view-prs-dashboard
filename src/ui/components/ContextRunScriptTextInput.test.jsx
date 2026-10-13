/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ContextRunScriptTextInput } = require('./ContextRunScriptTextInput');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor), so every render here needs them too.
const renderWithProvider = (initialValues, props) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={initialValues}>
            <ContextRunScriptTextInput {...props} />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('ContextRunScriptTextInput', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given the provider seeds a value, when rendering, then the input starts with it', () => {
    renderWithProvider(
      { repo: 'octocat/hello-world' },
      { id: 'repo', name: 'repo', filterStateKey: 'repo', placeholder: 'owner/repo' },
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'repo');
    expect(input).toHaveAttribute('name', 'repo');
    expect(input).toHaveAttribute('placeholder', 'owner/repo');
    expect(input).toHaveValue('octocat/hello-world');
  });

  test('given no seeded value, when rendering, then the input starts empty', () => {
    renderWithProvider({ repo: '' }, { id: 'repo', name: 'repo', filterStateKey: 'repo' });
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('given a number-type field, when rendering, then it gets a min=1 attribute', () => {
    renderWithProvider(
      { limit: '' },
      { id: 'limit', name: 'limit', type: 'number', filterStateKey: 'limit' },
    );
    expect(screen.getByRole('spinbutton')).toHaveAttribute('min', '1');
  });

  test('given a user types, when typing, then the value updates and window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider({ repo: '' }, { id: 'repo', name: 'repo', filterStateKey: 'repo' });
    const input = screen.getByRole('textbox');

    await user.type(input, 'octocat/hello-world');

    expect(input).toHaveValue('octocat/hello-world');
    expect(window.getFilterStateValues().repo).toBe('octocat/hello-world');
  });
});
