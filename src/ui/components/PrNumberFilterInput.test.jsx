/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { PrNumberFilterInput } = require('./PrNumberFilterInput');

describe('PrNumberFilterInput', () => {
  test('given no initialValue, when rendering, then renders an empty input with the expected id/name', () => {
    render(<PrNumberFilterInput />);
    const input = screen.getByPlaceholderText('912, 921');
    expect(input).toHaveAttribute('id', 'filter-pr-numbers');
    expect(input).toHaveAttribute('name', 'filterPrNumbers');
    expect(input).toHaveValue('');
  });

  test('given an initialValue, when rendering, then the input starts with that value', () => {
    render(<PrNumberFilterInput initialValue="912,921" />);
    expect(screen.getByPlaceholderText('912, 921')).toHaveValue('912,921');
  });

  test('given a user types into the input, when typing, then the displayed value updates', async () => {
    const user = userEvent.setup();
    render(<PrNumberFilterInput />);
    const input = screen.getByPlaceholderText('912, 921');

    await user.type(input, '55');

    expect(input).toHaveValue('55');
  });

  test('given an external native value change (e.g. restoring a persisted override), when the native setter + input event fire, then React state picks it up', () => {
    render(<PrNumberFilterInput />);
    const input = screen.getByPlaceholderText('912, 921');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call(input, '3');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input).toHaveValue('3');
  });
});
