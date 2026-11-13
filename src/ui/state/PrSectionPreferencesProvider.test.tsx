/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceSection } from '../components/settings/AppearanceSection';
import { PR_SECTION_ORDER_STORAGE_KEY, PR_SECTIONS_STORAGE_KEY } from '../helpers/pr-section-preferences.helpers';
import { PrSectionPreferencesProvider, usePrSectionPreferences } from './PrSectionPreferencesProvider';

// A stand-in for /view-prs/user-defaults: GET returns `saved` (after
// `holdGet` resolves, when a test sets it; a 500 while `getFails`), PUT
// replaces it.
let saved: Record<string, unknown>;
let holdGet: Promise<void> | null;
let getFails = false;
const fetchMock = jest.fn(async (_input: string, init?: RequestInit) => {
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({}) };
  }
  if (holdGet) await holdGet;
  if (getFails) return { ok: false, status: 500, json: async () => ({}) };
  const overrides = { ...saved };
  return { ok: true, json: async () => ({ overrides }) };
});

const renderSettings = () =>
  render(
    <PrSectionPreferencesProvider>
      <AppearanceSection />
    </PrSectionPreferencesProvider>,
  );

const showBox = (title: string) => screen.getByRole('checkbox', { name: `Show ${title}` });
const openBox = (title: string) => screen.getByRole('checkbox', { name: `Open ${title} when the page loads` });
const moveButton = (title: string, direction: 'up' | 'down') => screen.getByRole('button', { name: `Move ${title} ${direction}` });
// The section rows' titles in order, without the kind headings.
const sectionTitles = () =>
  screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('checkbox').length > 0)
    .map((row) => within(row).getByRole('rowheader').textContent);
const SMART = ['Flagged', 'In Review', 'Needs Attention', 'My Open & Draft PRs', 'Assigned to Me', 'Me as Reviewer', "Open PRs I'm Involved In"];
const STATUS = ['Open PRs', 'Draft PRs', 'Closed PRs', 'Latest Merged PRs'];

describe('Settings › Appearance sections', () => {
  beforeEach(() => {
    saved = { repo: 'owner/repo' };
    holdGet = null;
    window.localStorage.clear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockClear();
  });

  test('lists every section, all shown, with their built-in open states', async () => {
    renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const table = screen.getByRole('table', { name: 'Sections' });
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Smart groups', ...SMART, 'By status', ...STATUS]);
    expect(showBox('Flagged')).toBeChecked();
    expect(openBox('Flagged')).not.toBeChecked();
    expect(openBox('In Review')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Restore default sections' })).toBeDisabled();
  });

  test('shows the choices saved in user-defaults.json', async () => {
    saved = { prSections: { closed: { hidden: true }, flagged: { open: true } } };
    renderSettings();
    await waitFor(() => expect(showBox('Closed PRs')).not.toBeChecked());
    expect(openBox('Closed PRs')).toBeDisabled();
    expect(openBox('Flagged')).toBeChecked();
  });

  test('hiding a section and changing what starts open save to user-defaults.json, keeping the other settings', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.click(showBox('Closed PRs'));
    await user.click(openBox('Needs Attention'));

    await waitFor(() =>
      expect(saved).toEqual({
        repo: 'owner/repo',
        prSections: { closed: { hidden: true }, 'needs-attention': { open: false } },
      }),
    );
    expect(openBox('Closed PRs')).toBeDisabled();
  });

  test('Restore default sections removes the saved choices', async () => {
    const user = userEvent.setup();
    saved = { repo: 'owner/repo', prSections: { closed: { hidden: true } } };
    renderSettings();
    await waitFor(() => expect(showBox('Closed PRs')).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Restore default sections' }));

    expect(showBox('Closed PRs')).toBeChecked();
    await waitFor(() => expect(saved).toEqual({ repo: 'owner/repo' }));
  });

  test("Restore default sections keeps each section's sort, and isn't offered for a sort alone", async () => {
    const user = userEvent.setup();
    saved = {
      repo: 'owner/repo',
      prSections: { closed: { hidden: true, sort: { by: 'number', direction: 'asc' } }, open: { sort: { by: 'updated', direction: 'desc' } } },
    };
    renderSettings();
    await waitFor(() => expect(showBox('Closed PRs')).not.toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Restore default sections' }));

    await waitFor(() =>
      expect(saved).toEqual({
        repo: 'owner/repo',
        prSections: { closed: { sort: { by: 'number', direction: 'asc' } }, open: { sort: { by: 'updated', direction: 'desc' } } },
      }),
    );
    expect(showBox('Closed PRs')).toBeChecked();
    // Only sorts left: nothing for it to restore.
    expect(screen.getByRole('button', { name: 'Restore default sections' })).toBeDisabled();
  });

  test("a section moves up or down among its own kind, saved to user-defaults.json; the ends of each kind can't move further", async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(moveButton('Flagged', 'up')).toBeDisabled();
    expect(moveButton("Open PRs I'm Involved In", 'down')).toBeDisabled();
    expect(moveButton('Open PRs', 'up')).toBeDisabled();
    expect(moveButton('Latest Merged PRs', 'down')).toBeDisabled();

    await user.click(moveButton('Latest Merged PRs', 'up'));
    await user.click(moveButton('In Review', 'up'));

    const order = ['in-review', 'flagged', 'needs-attention', 'mine', 'assigned-to-me', 'review-requested', 'interacted', 'open', 'draft', 'merged', 'closed'];
    expect(sectionTitles()).toEqual(['In Review', 'Flagged', ...SMART.slice(2), 'Open PRs', 'Draft PRs', 'Latest Merged PRs', 'Closed PRs']);
    await waitFor(() => expect(saved).toEqual({ repo: 'owner/repo', prSectionOrder: order }));
    expect(JSON.parse(window.localStorage.getItem(PR_SECTION_ORDER_STORAGE_KEY) ?? 'null')).toEqual(order);
    // Moved to the top, its up button is disabled, so focus is on its down button.
    expect(moveButton('In Review', 'up')).toBeDisabled();
    await waitFor(() => expect(moveButton('In Review', 'down')).toHaveFocus());

    // Moved back, the default order isn't saved.
    await user.click(moveButton('In Review', 'down'));
    await user.click(moveButton('Latest Merged PRs', 'down'));
    await waitFor(() => expect(saved).toEqual({ repo: 'owner/repo' }));
  });

  test('shows the saved order, and Restore default sections puts it back', async () => {
    const user = userEvent.setup();
    saved = { repo: 'owner/repo', prSectionOrder: ['mine', 'merged'] };
    renderSettings();
    await waitFor(() => expect(sectionTitles()[0]).toBe('My Open & Draft PRs'));
    expect(sectionTitles()).toEqual([
      'My Open & Draft PRs',
      ...SMART.filter((title) => title !== 'My Open & Draft PRs'),
      'Latest Merged PRs',
      ...STATUS.slice(0, 3),
    ]);

    // An order alone is something to restore.
    await user.click(screen.getByRole('button', { name: 'Restore default sections' }));

    expect(sectionTitles()).toEqual([...SMART, ...STATUS]);
    await waitFor(() => expect(saved).toEqual({ repo: 'owner/repo' }));
    expect(screen.getByRole('button', { name: 'Restore default sections' })).toBeDisabled();
  });

  test('a choice made before the saved ones arrive is kept', async () => {
    const user = userEvent.setup();
    let release = () => {};
    holdGet = new Promise<void>((resolve) => {
      release = resolve;
    });
    saved = { prSections: { flagged: { hidden: true } } };
    renderSettings();

    await user.click(showBox('Draft PRs'));
    holdGet = null;
    await act(async () => release());

    expect(showBox('Draft PRs')).not.toBeChecked();
    expect(showBox('Flagged')).toBeChecked();
  });
});

describe('Settings › Appearance custom sections', () => {
  beforeEach(() => {
    saved = { repo: 'owner/repo' };
    holdGet = null;
    window.localStorage.clear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockClear();
    jest.restoreAllMocks();
  });

  const group = (name: string) => screen.getByRole('group', { name });
  const newForm = () => screen.getByRole('form', { name: 'New custom section' });
  const deleteCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

  test('a new section is saved with its name, icon and colour, and listed with the smart groups in the Sections table', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const add = within(newForm()).getByRole('button', { name: 'Add section' });
    expect(add).toBeDisabled();

    await user.type(within(newForm()).getByRole('textbox', { name: "New section's name" }), '  Release blockers ');
    await user.selectOptions(within(newForm()).getByRole('combobox', { name: 'Icon' }), 'Flag');
    await user.selectOptions(within(newForm()).getByRole('combobox', { name: 'Colour' }), 'Red');
    await user.click(add);

    await waitFor(() =>
      expect(saved.customSections).toEqual([{ id: expect.stringMatching(/^[a-z0-9]{8}$/), name: 'Release blockers', icon: 'flag', tone: 'danger' }]),
    );
    expect(within(newForm()).getByRole('textbox', { name: "New section's name" })).toHaveValue('');
    expect(sectionTitles()).toEqual([...SMART, 'Release blockers', ...STATUS]);
    expect(showBox('Release blockers')).toBeChecked();
    expect(openBox('Release blockers')).toBeChecked();
    expect(moveButton('Release blockers', 'down')).toBeDisabled();
    expect(within(group('Release blockers')).getByRole('textbox', { name: 'Name' })).toHaveValue('Release blockers');
  });

  test("a section's name, icon and colour change in place; an emptied name goes back to the saved one", async () => {
    const user = userEvent.setup();
    saved = { repo: 'owner/repo', customSections: [{ id: 'abc', name: 'Blockers', icon: 'tag', tone: 'accent' }] };
    renderSettings();
    await waitFor(() => expect(group('Blockers')).toBeInTheDocument());

    const name = within(group('Blockers')).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Release blockers{Enter}');
    await waitFor(() => expect(saved.customSections).toEqual([{ id: 'abc', name: 'Release blockers', icon: 'tag', tone: 'accent' }]));
    expect(sectionTitles()).toContain('Release blockers');

    await user.selectOptions(within(group('Release blockers')).getByRole('combobox', { name: 'Colour' }), 'Purple');
    await user.selectOptions(within(group('Release blockers')).getByRole('combobox', { name: 'Icon' }), 'Eye');
    await waitFor(() => expect(saved.customSections).toEqual([{ id: 'abc', name: 'Release blockers', icon: 'eye', tone: 'done' }]));

    const renamed = within(group('Release blockers')).getByRole('textbox', { name: 'Name' });
    await user.clear(renamed);
    await user.tab();
    expect(renamed).toHaveValue('Release blockers');
  });

  test("deleting a section, once confirmed, removes it, its choices and place in the order, and takes its PRs out of it", async () => {
    const user = userEvent.setup();
    saved = {
      repo: 'owner/repo',
      customSections: [
        { id: 'abc', name: 'Blockers', icon: 'tag', tone: 'accent' },
        { id: 'xyz', name: 'Later', icon: 'note', tone: 'muted' },
      ],
      prSections: { 'custom-abc': { open: false }, closed: { hidden: true } },
      prSectionOrder: ['custom-abc', 'flagged'],
    };
    renderSettings();
    await waitFor(() => expect(sectionTitles()[0]).toBe('Blockers'));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    await user.click(within(group('Blockers')).getByRole('button', { name: 'Delete Blockers' }));
    expect(confirm).toHaveBeenLastCalledWith('Delete the section "Blockers"?');
    expect(group('Blockers')).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);

    await user.click(within(group('Blockers')).getByRole('button', { name: 'Delete Blockers' }));

    await waitFor(() =>
      expect(saved).toEqual({
        repo: 'owner/repo',
        customSections: [{ id: 'xyz', name: 'Later', icon: 'note', tone: 'muted' }],
        prSections: { closed: { hidden: true } },
      }),
    );
    expect(screen.queryByRole('group', { name: 'Blockers' })).not.toBeInTheDocument();
    expect(sectionTitles()).toEqual([...SMART, 'Later', ...STATUS]);
    expect(deleteCalls()).toHaveLength(1);
    const [url, init] = deleteCalls()[0] ?? [];
    expect(url).toBe('/view-prs/custom-section-prs');
    expect(JSON.parse(String(init?.body))).toEqual({ sectionId: 'abc' });
  });

  test("a name another section already has (ignoring case) can't be added, and a rename to one goes back, saying why", async () => {
    const user = userEvent.setup();
    saved = {
      repo: 'owner/repo',
      customSections: [
        { id: 'abc', name: 'Blockers', icon: 'tag', tone: 'accent' },
        { id: 'xyz', name: 'Later', icon: 'note', tone: 'muted' },
      ],
    };
    renderSettings();
    await waitFor(() => expect(group('Blockers')).toBeInTheDocument());
    const newName = within(newForm()).getByRole('textbox', { name: "New section's name" });
    const add = within(newForm()).getByRole('button', { name: 'Add section' });

    await user.type(newName, ' flagged ');
    expect(add).toBeDisabled();
    expect(newName).toHaveAttribute('aria-invalid', 'true');
    expect(newName).toHaveAccessibleDescription('There\'s already a section called "flagged".');
    await user.clear(newName);
    await user.type(newName, 'LATER{Enter}');
    expect(add).toBeDisabled();
    await user.clear(newName);
    await user.type(newName, 'Soon');
    expect(add).toBeEnabled();
    expect(newName).not.toHaveAttribute('aria-invalid');

    const name = within(group('Blockers')).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'later');
    await user.tab();
    expect(name).toHaveValue('Blockers');
    expect(name).toHaveAccessibleDescription('There\'s already a section called "later".');
    // With Enter, then leaving the box, the message stays.
    await user.clear(name);
    await user.type(name, 'Later{Enter}');
    await user.tab();
    expect(name).toHaveValue('Blockers');
    expect(name).toHaveAccessibleDescription('There\'s already a section called "Later".');
    // Its own name, in another case, is fine.
    await user.clear(name);
    await user.type(name, 'BLOCKERS{Enter}');
    await waitFor(() => expect(within(group('BLOCKERS')).getByRole('textbox', { name: 'Name' })).toHaveValue('BLOCKERS'));
    expect(saved.customSections).toEqual([
      { id: 'abc', name: 'BLOCKERS', icon: 'tag', tone: 'accent' },
      { id: 'xyz', name: 'Later', icon: 'note', tone: 'muted' },
    ]);
  });

  test('the sections are kept in the browser too, so the next page draws them straight away', async () => {
    const user = userEvent.setup();
    const first = renderSettings();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await user.type(within(newForm()).getByRole('textbox', { name: "New section's name" }), 'Mine');
    await user.click(within(newForm()).getByRole('button', { name: 'Add section' }));
    await user.click(showBox('Mine'));
    first.unmount();

    holdGet = new Promise<void>(() => {});
    renderSettings();
    expect(sectionTitles()).toContain('Mine');
    expect(showBox('Mine')).not.toBeChecked();
  });
});

describe('the browser copy of the section choices', () => {
  const Probe = () => {
    const { preferences, isReady } = usePrSectionPreferences();
    return <output aria-label="Choices">{isReady ? JSON.stringify(preferences) : 'not ready'}</output>;
  };
  const renderProbe = () =>
    render(
      <PrSectionPreferencesProvider>
        <Probe />
        <AppearanceSection />
      </PrSectionPreferencesProvider>,
    );
  const choices = () => screen.getByRole('status', { name: 'Choices' });
  let release = () => {};

  beforeEach(() => {
    saved = { prSections: { closed: { hidden: true } } };
    holdGet = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.localStorage.clear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockClear();
    getFails = false;
  });

  test("when user-defaults.json can't be read, the copy is kept", async () => {
    getFails = true;
    window.localStorage.setItem(PR_SECTIONS_STORAGE_KEY, JSON.stringify({ draft: { hidden: true } }));
    renderProbe();

    await act(async () => release());

    expect(choices()).toHaveTextContent('{"draft":{"hidden":true}}');
    expect(JSON.parse(window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY) ?? 'null')).toEqual({ draft: { hidden: true } });
  });

  test("without a copy, a failed read shows the default sections rather than wait", async () => {
    getFails = true;
    renderProbe();

    await act(async () => release());

    expect(choices()).toHaveTextContent('{}');
    expect(window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY)).toBeNull();
  });

  test("without one, the choices aren't ready until user-defaults.json is read, and then it's made", async () => {
    renderProbe();
    expect(choices()).toHaveTextContent('not ready');

    await act(async () => release());

    expect(choices()).toHaveTextContent('{"closed":{"hidden":true}}');
    expect(JSON.parse(window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY) ?? 'null')).toEqual({ closed: { hidden: true } });
  });

  test('with one, the choices are ready at once, then the saved ones replace it', async () => {
    window.localStorage.setItem(PR_SECTIONS_STORAGE_KEY, JSON.stringify({ draft: { hidden: true } }));
    renderProbe();
    expect(choices()).toHaveTextContent('{"draft":{"hidden":true}}');

    await act(async () => release());

    expect(choices()).toHaveTextContent('{"closed":{"hidden":true}}');
    expect(JSON.parse(window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY) ?? 'null')).toEqual({ closed: { hidden: true } });
  });

  test('a malformed copy counts as none', async () => {
    window.localStorage.setItem(PR_SECTIONS_STORAGE_KEY, '{not json');
    renderProbe();
    expect(choices()).toHaveTextContent('not ready');
    await act(async () => release());
    expect(choices()).toHaveTextContent('{"closed":{"hidden":true}}');
  });

  test('a change updates the copy too', async () => {
    const user = userEvent.setup();
    holdGet = null;
    renderProbe();
    await waitFor(() => expect(choices()).toHaveTextContent('{"closed":{"hidden":true}}'));

    await user.click(showBox('Draft PRs'));

    expect(JSON.parse(window.localStorage.getItem(PR_SECTIONS_STORAGE_KEY) ?? 'null')).toEqual({
      closed: { hidden: true },
      draft: { hidden: true },
    });
  });
});
