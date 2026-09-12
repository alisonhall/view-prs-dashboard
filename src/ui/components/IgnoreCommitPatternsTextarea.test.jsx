/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { IgnoreCommitPatternsTextarea } = require('./IgnoreCommitPatternsTextarea');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (changeFilterIgnoreCommitPatterns = '') =>
  render(
    <FilterStateProvider initialValues={{ changeFilterIgnoreCommitPatterns }}>
      <IgnoreCommitPatternsTextarea />
    </FilterStateProvider>,
  );

describe('IgnoreCommitPatternsTextarea', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given the provider seeds an empty value, when rendering, then id/name/rows are applied and it starts empty', () => {
    renderWithProvider('');
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('id', 'change-filter-ignore-commit-patterns');
    expect(textarea).toHaveAttribute('name', 'changeFilterIgnoreCommitPatterns');
    expect(textarea).toHaveAttribute('rows', '4');
    expect(textarea).toHaveValue('');
  });

  test('given the provider seeds a value, when rendering, then the textarea starts with that value', () => {
    renderWithProvider('^docs:\n^test:');
    expect(screen.getByRole('textbox')).toHaveValue('^docs:\n^test:');
  });

  test('given a user types into the textarea, when typing, then the displayed value updates and window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, '^docs:');

    expect(textarea).toHaveValue('^docs:');
    expect(window.getFilterStateValues().changeFilterIgnoreCommitPatterns).toBe('^docs:');
  });

  test('given window.setFilterStateValue is called directly (the new restore path), when called, then the textarea reflects it', () => {
    const { act } = require('@testing-library/react');
    renderWithProvider();
    const textarea = screen.getByRole('textbox');

    act(() => {
      window.setFilterStateValue('changeFilterIgnoreCommitPatterns', '^chore:\n^style:');
    });

    expect(textarea).toHaveValue('^chore:\n^style:');
  });
});
