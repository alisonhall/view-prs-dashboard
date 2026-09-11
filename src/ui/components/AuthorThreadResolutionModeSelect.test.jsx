/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorThreadResolutionModeSelect } = require('./AuthorThreadResolutionModeSelect');

describe('AuthorThreadResolutionModeSelect', () => {
  test('given no initialValue, when rendering, then defaults to "allow-all"', () => {
    render(<AuthorThreadResolutionModeSelect />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'attention-author-thread-resolution-mode');
    expect(select).toHaveAttribute('name', 'attentionAuthorThreadResolutionMode');
    expect(select).toHaveValue('allow-all');
  });

  test('given an initialValue, when rendering, then the select starts with that value', () => {
    render(<AuthorThreadResolutionModeSelect initialValue="deny-only" />);
    expect(screen.getByRole('combobox')).toHaveValue('deny-only');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates and a real change event fires', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<AuthorThreadResolutionModeSelect />);
    const select = screen.getByRole('combobox');
    select.addEventListener('change', handleChange);

    await user.selectOptions(select, 'allow-only');

    expect(select).toHaveValue('allow-only');
    // Vanilla's updateAuthorThreadResolutionRuleVisibility() is wired via a
    // real addEventListener("change", ...) on this element's id - confirm
    // a real native change event still reaches such a listener.
    expect(handleChange).toHaveBeenCalled();
  });

  test('given an external native value change, when the native setter + change event fire, then React state picks it up', () => {
    render(<AuthorThreadResolutionModeSelect />);
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'deny-only');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('deny-only');
  });
});
