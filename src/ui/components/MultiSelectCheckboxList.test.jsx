/** @jest-environment jsdom */

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

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): this component now also owns the "empty"
  // class on its own portal target (emptyClassContainer) and the "(N
  // selected)" summary count text (portaled into summaryContainer),
  // replacing pr-filter-panel.helpers.js's updateMultiSelectSummary and
  // every populateXOptions/renderActorOptionsList/
  // renderChangeFilterActorList classList.add/remove("empty") call.
  describe('empty-state class and summary count (deferred-items follow-up, see REACT_MIGRATION_PLAN.md)', () => {
    const makeSummaryContainer = (baseLabel) => {
      const el = document.createElement('summary');
      el.dataset.baseLabel = baseLabel;
      return el;
    };

    test('given zero options, when rendering, then "empty" is added to emptyClassContainer', () => {
      const emptyClassContainer = document.createElement('div');
      render(<MultiSelectCheckboxList idPrefix="label" options={[]} emptyClassContainer={emptyClassContainer} />);

      expect(emptyClassContainer.classList.contains('empty')).toBe(true);
    });

    test('given options, when rendering, then "empty" is not present on emptyClassContainer', () => {
      const emptyClassContainer = document.createElement('div');
      emptyClassContainer.classList.add('empty'); // simulate a previous empty state
      render(
        <MultiSelectCheckboxList
          idPrefix="label"
          options={[{ value: 'bug', label: 'bug', checked: false }]}
          emptyClassContainer={emptyClassContainer}
        />,
      );

      expect(emptyClassContainer.classList.contains('empty')).toBe(false);
    });

    test('given a summaryContainer with data-base-label and nothing checked, when rendering, then the summary shows just the base label', () => {
      const summaryContainer = makeSummaryContainer('Filter by label name(s)');
      document.body.appendChild(summaryContainer);
      render(
        <MultiSelectCheckboxList
          idPrefix="label"
          options={[{ value: 'bug', label: 'bug', checked: false }]}
          summaryContainer={summaryContainer}
        />,
      );

      expect(summaryContainer.textContent).toBe('Filter by label name(s)');
      document.body.removeChild(summaryContainer);
    });

    test('given options checked at mount, when rendering, then the summary shows the base label with the count', () => {
      const summaryContainer = makeSummaryContainer('Filter by label name(s)');
      document.body.appendChild(summaryContainer);
      render(
        <MultiSelectCheckboxList
          idPrefix="label"
          options={[
            { value: 'bug', label: 'bug', checked: true },
            { value: 'enhancement', label: 'enhancement', checked: false },
          ]}
          summaryContainer={summaryContainer}
        />,
      );

      expect(summaryContainer.textContent).toBe('Filter by label name(s) (1 selected)');
      document.body.removeChild(summaryContainer);
    });

    test('given a user checks/unchecks a box, when toggling, then the summary count updates live', async () => {
      const summaryContainer = makeSummaryContainer('Filter by label name(s)');
      document.body.appendChild(summaryContainer);
      const user = userEvent.setup();
      render(
        <MultiSelectCheckboxList
          idPrefix="label"
          options={[
            { value: 'bug', label: 'bug', checked: false },
            { value: 'enhancement', label: 'enhancement', checked: false },
          ]}
          summaryContainer={summaryContainer}
        />,
      );
      expect(summaryContainer.textContent).toBe('Filter by label name(s)');

      await user.click(screen.getByLabelText('bug'));
      expect(summaryContainer.textContent).toBe('Filter by label name(s) (1 selected)');

      await user.click(screen.getByLabelText('enhancement'));
      expect(summaryContainer.textContent).toBe('Filter by label name(s) (2 selected)');

      await user.click(screen.getByLabelText('bug'));
      expect(summaryContainer.textContent).toBe('Filter by label name(s) (1 selected)');

      document.body.removeChild(summaryContainer);
    });
  });
});
