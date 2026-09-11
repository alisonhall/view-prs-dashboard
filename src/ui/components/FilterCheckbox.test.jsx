/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterCheckbox } = require('./FilterCheckbox');

describe('FilterCheckbox', () => {
  test('given id/name props, when rendering, then they are applied to the input', () => {
    render(<FilterCheckbox id="attention-include-closed-merged" name="attentionIncludeClosedMerged" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'attention-include-closed-merged');
    expect(checkbox).toHaveAttribute('name', 'attentionIncludeClosedMerged');
  });

  test('given no initialChecked, when rendering, then starts unchecked', () => {
    render(<FilterCheckbox id="x" name="x" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('given initialChecked true, when rendering, then starts checked', () => {
    render(<FilterCheckbox id="x" name="x" initialChecked />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given a user clicks the checkbox, when clicking, then it toggles', async () => {
    const user = userEvent.setup();
    render(<FilterCheckbox id="x" name="x" />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
