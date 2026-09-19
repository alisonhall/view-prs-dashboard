/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { MultiSelectCheckboxList } = require('./MultiSelectCheckboxList');

describe('MultiSelectCheckboxList', () => {
  test('given options, when rendering, then one checkbox+label renders per option', () => {
    render(
      <MultiSelectCheckboxList
        idPrefix="label"
        options={[
          { value: 'bug', label: 'bug', checked: false },
          { value: 'enhancement', label: 'enhancement', checked: false },
        ]}
      />,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByLabelText('bug')).toBeInTheDocument();
    expect(screen.getByLabelText('enhancement')).toBeInTheDocument();
  });

  test('given an option with checked: true, when rendering, then that checkbox starts checked', () => {
    render(
      <MultiSelectCheckboxList
        idPrefix="label"
        options={[
          { value: 'bug', label: 'bug', checked: true },
          { value: 'enhancement', label: 'enhancement', checked: false },
        ]}
      />,
    );

    expect(screen.getByLabelText('bug')).toBeChecked();
    expect(screen.getByLabelText('enhancement')).not.toBeChecked();
  });

  test('given the checkbox value attribute, when rendering, then it matches the option value (read by getSelectedMultiSelectValues)', () => {
    render(
      <MultiSelectCheckboxList
        idPrefix="label"
        options={[{ value: 'needs-review', label: 'Needs Review', checked: false }]}
      />,
    );

    expect(screen.getByRole('checkbox')).toHaveAttribute('value', 'needs-review');
  });

  test('given a user clicks a checkbox, when clicking, then it toggles independently of the others', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectCheckboxList
        idPrefix="label"
        options={[
          { value: 'bug', label: 'bug', checked: false },
          { value: 'enhancement', label: 'enhancement', checked: false },
        ]}
      />,
    );

    await user.click(screen.getByLabelText('bug'));

    expect(screen.getByLabelText('bug')).toBeChecked();
    expect(screen.getByLabelText('enhancement')).not.toBeChecked();
  });

  test('given duplicate-looking values with different casing/punctuation, when generating checkbox ids, then ids stay unique and slugified', () => {
    render(
      <MultiSelectCheckboxList
        idPrefix="label"
        options={[
          { value: 'Needs Review!', label: 'Needs Review!', checked: false },
          { value: '???', label: '???', checked: false },
        ]}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toHaveAttribute('id', 'label-needs-review-0');
    expect(checkboxes[1]).toHaveAttribute('id', 'label-item-1');
  });

  test('given no options, when rendering, then nothing is rendered', () => {
    const { container } = render(<MultiSelectCheckboxList idPrefix="label" options={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
