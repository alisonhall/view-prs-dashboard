/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const userEvent = require('@testing-library/user-event').default;
const { TableFilterChips } = require('./TableFilterChips');

describe('TableFilterChips', () => {
  test('given no chips, when rendering, then renders nothing at all', () => {
    const { container } = render(<TableFilterChips chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given no chips prop at all, when rendering, then renders nothing at all', () => {
    const { container } = render(<TableFilterChips />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given chips, when rendering, then shows each chip label with a remove button', () => {
    const chips = [
      { id: 'a', label: 'Scope: needs-attention', onRemove: jest.fn() },
      { id: 'b', label: 'Label: bug', onRemove: jest.fn() },
    ];
    render(<TableFilterChips chips={chips} />);

    expect(screen.getByText('Scope: needs-attention')).toBeInTheDocument();
    expect(screen.getByText('Label: bug')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Scope: needs-attention' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Label: bug' })).toBeInTheDocument();
  });

  test("given a chip, when clicking its remove button, then calls that chip's onRemove and no other chip's", async () => {
    const user = userEvent.setup();
    const onRemoveA = jest.fn();
    const onRemoveB = jest.fn();
    const chips = [
      { id: 'a', label: 'Scope: needs-attention', onRemove: onRemoveA },
      { id: 'b', label: 'Label: bug', onRemove: onRemoveB },
    ];
    render(<TableFilterChips chips={chips} />);

    await user.click(screen.getByRole('button', { name: 'Remove filter: Label: bug' }));

    expect(onRemoveB).toHaveBeenCalledTimes(1);
    expect(onRemoveA).not.toHaveBeenCalled();
  });
});
