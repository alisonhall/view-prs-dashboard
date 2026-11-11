/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsDrawerContext, type SettingsDrawerValue } from '../../state/SettingsDrawerContext';
import { PeopleSection, type Person } from './PeopleSection';

// A stand-in server: GET /view-prs/actors answers `people`; PUT answers
// `putAnswer` (when set), else saves what it's sent.
let people: Person[];
let putAnswer: { status: number; body: unknown } | null;
const puts: unknown[] = [];
const fetchMock = jest.fn(async (_input: string, init?: RequestInit) => {
  if (init?.method === 'PUT') {
    const body = JSON.parse(String(init.body));
    puts.push(body);
    if (putAnswer) return { ok: putAnswer.status < 400, status: putAnswer.status, json: async () => putAnswer?.body };
    people = body.actors.map((actor: Partial<Person>, index: number) => ({ id: actor.id || `actor:new-${index}`, name: actor.name, logins: actor.logins }));
    return { ok: true, status: 200, json: async () => ({ ok: true, actors: people }) };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, actors: people }) };
});

const PEOPLE: Person[] = [
  { id: 'actor:ann', name: 'Ann Lee', logins: ['ann', 'ann-work'] },
  { id: 'actor:bob', name: '', logins: ['bob'] },
];

const drawerAt = (section: string) => ({ isOpen: true, section }) as unknown as SettingsDrawerValue;
const renderAt = (section = 'people') =>
  render(
    <SettingsDrawerContext.Provider value={drawerAt(section)}>
      <PeopleSection />
    </SettingsDrawerContext.Provider>,
  );
const rows = () => within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');

describe('PeopleSection', () => {
  beforeEach(() => {
    people = PEOPLE.map((person) => ({ ...person, logins: [...person.logins] }));
    putAnswer = null;
    puts.length = 0;
    fetchMock.mockClear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  // A person's logins, as their fields show them.
  const loginsOf = (label: string) =>
    within(screen.getByRole('group', { name: `Logins for ${label}` }))
      .getAllByRole('textbox')
      .map((input) => (input as HTMLInputElement).value);

  test('lists everyone, a row each: their name and logins, a field each', async () => {
    renderAt();
    expect(await screen.findByRole('textbox', { name: 'Name for Ann Lee' })).toHaveValue('Ann Lee');
    expect(loginsOf('Ann Lee')).toEqual(['ann', 'ann-work']);
    expect(screen.getByRole('textbox', { name: 'Main login for Ann Lee' })).toHaveValue('ann');
    expect(screen.getByRole('textbox', { name: 'Login 2 for Ann Lee' })).toHaveValue('ann-work');
    // Without a name, a person is called by their first login.
    expect(screen.getByRole('textbox', { name: 'Name for bob' })).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('2 people');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('a change is kept on the page until Save, which sends everyone, ids kept, blank logins dropped', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for bob' });
    await user.click(within(screen.getByRole('group', { name: 'Logins for bob' })).getByRole('button', { name: '+ Add login' }));
    // The new field takes the focus.
    expect(screen.getByRole('textbox', { name: 'Login 2 for bob' })).toHaveFocus();
    await user.keyboard(' bobby ');
    await user.click(within(screen.getByRole('group', { name: 'Logins for bob' })).getByRole('button', { name: '+ Add login' }));
    await user.type(screen.getByRole('textbox', { name: 'Name for bob' }), 'Bob Ray');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(puts).toEqual([
      {
        actors: [
          { id: 'actor:ann', name: 'Ann Lee', logins: ['ann', 'ann-work'] },
          { id: 'actor:bob', name: 'Bob Ray', logins: ['bob', 'bobby'] },
        ],
      },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved 2 people.');
    expect(loginsOf('Bob Ray')).toEqual(['bob', 'bobby']);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // A commit author's name: what GitHub gives for commits not linked to an
  // account. One field per login, so its comma isn't a separator.
  test("a commit author's name, comma and all, stays one identity - labelled as one - and a save doesn't split it", async () => {
    const user = userEvent.setup();
    people = [{ id: 'actor:vkandal', name: 'Kandal, Vipul', logins: ['vkandal'] }];
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for Kandal, Vipul' });
    expect(screen.queryByText('Commit author (no GitHub account)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Add login' }));
    await user.keyboard('Kandal, Vipul');
    const added = screen.getByRole('textbox', { name: 'Login 2 for Kandal, Vipul' });
    expect(added).toHaveAccessibleDescription('Commit author (no GitHub account)');
    expect(screen.getByRole('textbox', { name: 'Main login for Kandal, Vipul' })).not.toHaveAccessibleDescription();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(puts).toEqual([{ actors: [{ id: 'actor:vkandal', name: 'Kandal, Vipul', logins: ['vkandal', 'Kandal, Vipul'] }] }]);
    expect(loginsOf('Kandal, Vipul')).toEqual(['vkandal', 'Kandal, Vipul']);
  });

  // The server makes an id from the first login as it is: one added for a
  // commit author has a space in it.
  test('a commit author added as someone of their own is labelled too, though their id has a space', async () => {
    people = [{ id: 'actor:lee, ann', name: '', logins: ['Lee, Ann'] }];
    renderAt();
    expect(await screen.findByRole('textbox', { name: 'Main login for Lee, Ann' })).toHaveAccessibleDescription(
      'Commit author (no GitHub account)',
    );
  });

  test("a login's × removes just that login", async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for Ann Lee' });
    await user.click(screen.getByRole('button', { name: 'Remove ann-work from Ann Lee' }));
    expect(loginsOf('Ann Lee')).toEqual(['ann']);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((puts[0] as { actors: Person[] }).actors[0]).toEqual({ id: 'actor:ann', name: 'Ann Lee', logins: ['ann'] });
  });

  test('Add person puts an empty row first, focused; left empty, it is not sent', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for Ann Lee' });
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Name for New person' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Remove bob' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(puts).toEqual([{ actors: [{ id: 'actor:ann', name: 'Ann Lee', logins: ['ann', 'ann-work'] }] }]);
  });

  test("the server's refusal is shown, and the edits stay to fix", async () => {
    const user = userEvent.setup();
    putAnswer = { status: 400, body: { ok: false, error: 'ann is in two people: Ann Lee and bob.' } };
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for bob' });
    await user.click(within(screen.getByRole('group', { name: 'Logins for bob' })).getByRole('button', { name: '+ Add login' }));
    await user.keyboard('ann');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved: ann is in two people: Ann Lee and bob.');
    expect(loginsOf('bob')).toEqual(['bob', 'ann']);
  });

  test("says so when the server can't read the people file, rather than show no one as if that were so", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, actors: [], unreadable: true }) }));
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent("data/actors.json couldn't be read");
  });

  test('Undo changes puts back what is saved', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.clear(await screen.findByRole('textbox', { name: 'Name for Ann Lee' }));
    await user.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(screen.getByRole('textbox', { name: 'Name for Ann Lee' })).toHaveValue('Ann Lee');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('Find narrows the rows by name or login, ignoring case', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByRole('textbox', { name: 'Name for Ann Lee' });
    await user.type(screen.getByRole('searchbox', { name: 'Find a person' }), 'WORK');
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('showing 1 of 2');
  });

  test('back in view it loads again, but not over unsaved edits', async () => {
    const user = userEvent.setup();
    const { rerender } = renderAt('people');
    await screen.findByRole('textbox', { name: 'Name for Ann Lee' });
    const tree = (section: string) => (
      <SettingsDrawerContext.Provider value={drawerAt(section)}>
        <PeopleSection />
      </SettingsDrawerContext.Provider>
    );
    people = [...people, { id: 'actor:cy', name: 'Cy', logins: ['cy'] }];
    rerender(tree('sources'));
    rerender(tree('people'));
    expect(await screen.findByRole('textbox', { name: 'Name for Cy' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Name for Cy' }), '!');
    const loads = fetchMock.mock.calls.length;
    rerender(tree('sources'));
    rerender(tree('people'));
    await act(async () => {});
    expect(fetchMock.mock.calls.length).toBe(loads);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name for Cy!' })).toHaveValue('Cy!'));
  });
});
