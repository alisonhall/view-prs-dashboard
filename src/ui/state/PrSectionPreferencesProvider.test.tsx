/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceSection } from '../components/settings/AppearanceSection';
import { PR_SECTIONS_STORAGE_KEY } from '../helpers/pr-section-preferences.helpers';
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
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Flagged',
      'In Review',
      'Needs Attention',
      'My Open & Draft PRs',
      'Assigned to Me',
      'Me as Reviewer',
      "Open PRs I'm Involved In",
      'Open PRs',
      'Draft PRs',
      'Closed PRs',
      'Latest Merged PRs',
    ]);
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
