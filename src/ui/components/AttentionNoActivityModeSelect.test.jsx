/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AttentionNoActivityModeSelect } = require('./AttentionNoActivityModeSelect');

describe('AttentionNoActivityModeSelect', () => {
  test('given no initialValue, when rendering, then defaults to "all"', () => {
    render(<AttentionNoActivityModeSelect />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'attention-no-activity-mode');
    expect(select).toHaveAttribute('name', 'attentionNoActivityMode');
    expect(select).toHaveValue('all');
  });

  test('given an initialValue, when rendering, then the select starts with that value', () => {
    render(<AttentionNoActivityModeSelect initialValue="mine-only" />);
    expect(screen.getByRole('combobox')).toHaveValue('mine-only');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    render(<AttentionNoActivityModeSelect />);
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'none');

    expect(select).toHaveValue('none');
  });

  test('given an external native value change, when the native setter + change event fire, then React state picks it up', () => {
    render(<AttentionNoActivityModeSelect />);
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'reviewer-only');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('reviewer-only');
  });
});
