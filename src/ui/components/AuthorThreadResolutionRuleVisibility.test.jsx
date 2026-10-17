/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorThreadResolutionRuleVisibility } = require('./AuthorThreadResolutionRuleVisibility');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { useFilterState } = require('../state/FilterStateContext');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');

function ModeSwitcher({ mode }) {
  const { setValue } = useFilterState();
  return (
    <button type="button" onClick={() => setValue('attentionAuthorThreadResolutionMode', mode)}>
      switch to {mode}
    </button>
  );
}

// These 2 <details> stay static markup in index.html (see the component's
// own header comment for why) - this test seeds the same shape directly
// into the real document, same as the real page, instead of rendering them
// via this component.
const seedStaticDetailsMarkup = () => {
  document.body.innerHTML = `
    <details id="attention-author-thread-resolution-allow-options" hidden></details>
    <details id="attention-author-thread-resolution-deny-options" hidden></details>
  `;
};

const renderWithProvider = (attentionAuthorThreadResolutionMode, extraChildren = null) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ attentionAuthorThreadResolutionMode }}>
            {extraChildren}
            <AuthorThreadResolutionRuleVisibility />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('AuthorThreadResolutionRuleVisibility', () => {
  beforeEach(() => {
    seedStaticDetailsMarkup();
  });

  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given mode is "allow-all" (default), when rendered, then both panels are hidden', () => {
    renderWithProvider('allow-all');
    expect(document.getElementById('attention-author-thread-resolution-allow-options')).toHaveAttribute('hidden');
    expect(document.getElementById('attention-author-thread-resolution-deny-options')).toHaveAttribute('hidden');
  });

  test('given mode is "allow-only", when rendered, then only the allow panel is visible', () => {
    renderWithProvider('allow-only');
    expect(document.getElementById('attention-author-thread-resolution-allow-options')).not.toHaveAttribute('hidden');
    expect(document.getElementById('attention-author-thread-resolution-deny-options')).toHaveAttribute('hidden');
  });

  test('given mode is "deny-only", when rendered, then only the deny panel is visible', () => {
    renderWithProvider('deny-only');
    expect(document.getElementById('attention-author-thread-resolution-allow-options')).toHaveAttribute('hidden');
    expect(document.getElementById('attention-author-thread-resolution-deny-options')).not.toHaveAttribute('hidden');
  });

  test('given the allow panel is open, when the mode changes away from "allow-only", then it is force-closed', async () => {
    const user = userEvent.setup();
    renderWithProvider('allow-only', <ModeSwitcher mode="allow-all" />);
    const allowOptions = document.getElementById('attention-author-thread-resolution-allow-options');
    allowOptions.open = true;

    await user.click(screen.getByRole('button', { name: 'switch to allow-all' }));

    expect(allowOptions).toHaveAttribute('hidden');
    expect(allowOptions.open).toBe(false);
  });

  test('given neither panel exists in the DOM, when rendered, then it does not throw', () => {
    document.body.innerHTML = '';
    expect(() => renderWithProvider('allow-only')).not.toThrow();
  });
});
