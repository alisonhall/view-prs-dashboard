/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AlwaysShowInReviewCheckbox } = require('./AlwaysShowInReviewCheckbox');

describe('AlwaysShowInReviewCheckbox', () => {
  test('given no initialChecked, when rendering, then starts unchecked', () => {
    render(<AlwaysShowInReviewCheckbox />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'always-show-in-review');
    expect(checkbox).toHaveAttribute('name', 'alwaysShowInReview');
    expect(checkbox).not.toBeChecked();
  });

  test('given initialChecked true, when rendering, then starts checked', () => {
    render(<AlwaysShowInReviewCheckbox initialChecked />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given a user clicks the checkbox, when clicking, then it toggles', async () => {
    const user = userEvent.setup();
    render(<AlwaysShowInReviewCheckbox />);
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('given an external .click() (e.g. restoring a persisted override), when the native click fires, then React state picks it up', async () => {
    const user = userEvent.setup();
    render(<AlwaysShowInReviewCheckbox />);
    const checkbox = screen.getByRole('checkbox');

    // Mirrors index.page.js's setCheckbox(), which calls element.click()
    // rather than assigning `.checked` directly.
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });
});
