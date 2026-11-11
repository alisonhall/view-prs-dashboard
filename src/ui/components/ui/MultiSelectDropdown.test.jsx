/** @jest-environment jsdom */

const { useRef, useState } = require('react');
const { render, screen, act, fireEvent } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { MultiSelectDropdown, SEARCH_FROM } = require('./MultiSelectDropdown');
const { useFocusTrap } = require('../../state/useFocusTrap');

const people = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'].map((name) => ({
  value: name.toLowerCase(),
  label: name,
}));

function Host({ options = people, description }) {
  const [checked, setChecked] = useState(new Set());
  const toggle = (value) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  return (
    <MultiSelectDropdown
      listId="author-list"
      label="Authors"
      idPrefix="author"
      options={options}
      checked={checked}
      onToggle={toggle}
      description={description}
    />
  );
}

const shownLabels = () => screen.queryAllByRole('checkbox', { hidden: true }).map((box) => box.labels[0].textContent);

// jsdom fires no toggle event when the summary is clicked.
const open = async (user) => {
  await user.click(screen.getByText('Authors', { selector: 'summary span' }));
  fireEvent(screen.getByRole('group', { name: 'Authors', hidden: true }).closest('details'), new Event('toggle'));
};

describe('MultiSelectDropdown', () => {
  test(`a list of ${SEARCH_FROM} or fewer has no search box`, () => {
    render(<Host options={people.slice(0, SEARCH_FROM)} />);
    expect(screen.queryByRole('searchbox', { hidden: true })).not.toBeInTheDocument();
    expect(shownLabels()).toHaveLength(SEARCH_FROM);
  });

  test('a longer list starts with a search box, which has the focus when it opens', async () => {
    const user = userEvent.setup();
    render(<Host description="Shows PRs opened by any of these people." />);

    await open(user);

    const search = screen.getByRole('searchbox', { name: 'Search Authors' });
    expect(search).toHaveFocus();
    // Before the description and the options.
    expect(search.compareDocumentPosition(screen.getByText(/^Shows PRs/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('typing narrows the list by label or value, ignoring case, and says how many match', async () => {
    const user = userEvent.setup();
    render(<Host options={[...people, { value: 'octocat', label: 'The Octocat' }]} />);
    await open(user);
    const search = screen.getByRole('searchbox', { name: 'Search Authors' });

    await user.type(search, 'AL');
    expect(shownLabels()).toEqual(['Alice']);
    expect(screen.getByRole('status')).toHaveTextContent('1 match');

    await user.clear(search);
    await user.type(search, 'octo');
    expect(shownLabels()).toEqual(['The Octocat']);

    await user.clear(search);
    await user.type(search, 'zz');
    expect(shownLabels()).toEqual([]);
    expect(screen.getByText('No matches', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });

  test("a narrowed list keeps each checkbox's id and its ticks", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await open(user);

    await user.type(screen.getByRole('searchbox', { name: 'Search Authors' }), 'judy');
    const judy = screen.getByRole('checkbox', { name: 'Judy' });
    expect(judy).toHaveAttribute('id', 'author-judy-9');
    await user.click(judy);
    expect(judy).toBeChecked();

    await user.clear(screen.getByRole('searchbox', { name: 'Search Authors' }));
    expect(screen.getByRole('checkbox', { name: 'Judy' })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  test('Escape clears the search, then closes the list with the focus on its summary', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await open(user);
    const search = screen.getByRole('searchbox', { name: 'Search Authors' });
    await user.type(search, 'al');

    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(search.closest('details').open).toBe(true);

    await user.keyboard('{Escape}');
    expect(search.closest('details').open).toBe(false);
    expect(screen.getByText('Authors', { selector: 'summary span' }).closest('summary')).toHaveFocus();
  });

  test("Escape in the search box doesn't close the Settings drawer around it", async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    // As the drawer: Escape closes it, from a listener on its own element.
    function Drawer() {
      const ref = useRef(null);
      useFocusTrap(ref, true, onEscape);
      return (
        <div ref={ref} tabIndex={-1}>
          <Host />
        </div>
      );
    }
    render(<Drawer />);
    await open(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search Authors' }), 'al');

    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    expect(onEscape).not.toHaveBeenCalled();

    // From the summary, it's the drawer's again.
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  test('ungrouped options after the groups (ticked values no PR has) render without a warning', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const grouped = people.map((option, index) => ({ ...option, group: index < 2 ? 'Recent PRs' : 'Everyone else' }));
    render(<Host options={[...grouped, { value: 'ghost', label: 'ghost · no PRs loaded' }]} />);
    await open(user);

    expect(shownLabels().at(-1)).toBe('ghost · no PRs loaded');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test('closing clears the search', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await open(user);
    await user.type(screen.getByRole('searchbox', { name: 'Search Authors' }), 'al');

    const details = screen.getByRole('group', { name: 'Authors' }).closest('details');
    act(() => {
      details.open = false;
      details.dispatchEvent(new Event('toggle'));
    });

    expect(screen.getByRole('searchbox', { name: 'Search Authors', hidden: true })).toHaveValue('');
    expect(shownLabels()).toHaveLength(people.length);
  });

  test('options in groups: each named when more than one is showing', async () => {
    const user = userEvent.setup();
    const grouped = people.map((option, index) => ({ ...option, group: index < 2 ? 'Recent PRs' : 'Everyone else' }));
    render(<Host options={grouped} />);
    await open(user);

    expect(screen.getByRole('group', { name: 'Recent PRs' })).toHaveTextContent('AliceBob');
    expect(screen.getByRole('group', { name: 'Everyone else' })).toHaveTextContent(/^Everyone elseCarol/);

    // Only one group left: no names.
    await user.type(screen.getByRole('searchbox', { name: 'Search Authors' }), 'carol');
    expect(screen.queryByRole('group', { name: 'Everyone else' })).not.toBeInTheDocument();
    expect(shownLabels()).toEqual(['Carol']);
  });

  test('an empty list says so', () => {
    render(<Host options={[]} />);
    expect(screen.getByText('No options')).toBeInTheDocument();
  });
});
