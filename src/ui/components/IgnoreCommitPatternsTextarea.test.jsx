/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { IgnoreCommitPatternsTextarea } = require('./IgnoreCommitPatternsTextarea');

describe('IgnoreCommitPatternsTextarea', () => {
  test('given no props, when rendering, then id/name/rows are applied and it starts empty', () => {
    render(<IgnoreCommitPatternsTextarea />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('id', 'change-filter-ignore-commit-patterns');
    expect(textarea).toHaveAttribute('name', 'changeFilterIgnoreCommitPatterns');
    expect(textarea).toHaveAttribute('rows', '4');
    expect(textarea).toHaveValue('');
  });

  test('given an initialValue, when rendering, then the textarea starts with that value', () => {
    render(<IgnoreCommitPatternsTextarea initialValue={'^docs:\n^test:'} />);
    expect(screen.getByRole('textbox')).toHaveValue('^docs:\n^test:');
  });

  test('given a user types into the textarea, when typing, then the displayed value updates', async () => {
    const user = userEvent.setup();
    render(<IgnoreCommitPatternsTextarea />);
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, '^docs:');

    expect(textarea).toHaveValue('^docs:');
  });

  test('given an external native value change (e.g. restoring a persisted override), when the native setter + change event fire, then React state picks it up', () => {
    render(<IgnoreCommitPatternsTextarea />);
    const textarea = screen.getByRole('textbox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    ).set;
    nativeSetter.call(textarea, '^chore:\n^style:');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    expect(textarea).toHaveValue('^chore:\n^style:');
  });
});
