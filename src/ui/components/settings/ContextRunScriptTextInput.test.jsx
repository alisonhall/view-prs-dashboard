/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ContextRunScriptTextInput } = require('./ContextRunScriptTextInput');
const { FilterStateProvider } = require('../../state/FilterStateProvider');
const { createFilterStateProbe } = require('../../test-fixtures/filter-state-probe');
const { RowFilterSelectionProvider } = require('../../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../../state/ChangeFilterActorSelectionProvider');

const filterStateProbe = createFilterStateProbe();

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
            <filterStateProbe.FilterStateProbe />
            <ContextRunScriptTextInput {...props} />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('ContextRunScriptTextInput', () => {

  // Window-bridge elimination Phase 7.5: index.page.js used to add these by
  // DOM id after React rendered the input (all five Run Script fields use
  // this component).
  test('given the input renders, when read, then it carries the non-credential-field hints', () => {
    renderWithProvider({}, { id: 'limit', name: 'limit', filterStateKey: 'limit', type: 'number' });
    const input = document.getElementById('limit');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAttribute('data-1p-ignore', 'true');
    expect(input).toHaveAttribute('data-bwignore', 'true');
    expect(input).toHaveAttribute('data-form-type', 'other');
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

  test('given a user types, when typing, then the value updates and filterStateProbe.readValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider({ repo: '' }, { id: 'repo', name: 'repo', filterStateKey: 'repo' });
    const input = screen.getByRole('textbox');

    await user.type(input, 'octocat/hello-world');

    expect(input).toHaveValue('octocat/hello-world');
    expect(filterStateProbe.readValues().repo).toBe('octocat/hello-world');
  });
});
