/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { RunScriptTextInput } = require('./RunScriptTextInput');

describe('RunScriptTextInput', () => {
  test('given id/name/placeholder props, when rendering, then they are applied to the input', () => {
    render(<RunScriptTextInput id="repo" name="repo" placeholder="owner/name" />);
    const input = screen.getByPlaceholderText('owner/name');
    expect(input).toHaveAttribute('id', 'repo');
    expect(input).toHaveAttribute('name', 'repo');
    expect(input).toHaveAttribute('type', 'text');
  });

  test('given type="number", when rendering, then the input has type="number" and min="1"', () => {
    render(<RunScriptTextInput id="limit" name="limit" type="number" placeholder="200" />);
    const input = screen.getByPlaceholderText('200');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '1');
  });

  test('given no initialValue, when rendering, then starts empty', () => {
    render(<RunScriptTextInput id="jobs" name="jobs" type="number" />);
    expect(screen.getByRole('spinbutton')).toHaveValue(null);
  });

  test('given an initialValue, when rendering, then the input starts with that value', () => {
    render(<RunScriptTextInput id="repo" name="repo" initialValue="octocat/hello-world" />);
    expect(screen.getByRole('textbox')).toHaveValue('octocat/hello-world');
  });

  test('given a user types into the input, when typing, then the displayed value updates', async () => {
    const user = userEvent.setup();
    render(<RunScriptTextInput id="repo" name="repo" />);
    const input = screen.getByRole('textbox');

    await user.type(input, 'octocat/hello-world');

    expect(input).toHaveValue('octocat/hello-world');
  });

  test('given an external native value change (e.g. restoring a persisted override), when the native setter + change event fire, then React state picks it up', () => {
    render(<RunScriptTextInput id="repo" name="repo" />);
    const input = screen.getByRole('textbox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call(input, 'restored/value');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(input).toHaveValue('restored/value');
  });
});
