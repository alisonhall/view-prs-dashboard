/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render as baseRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestActivityContext } from '../../state/RequestActivityContext';
import { NotesDirtyContext } from '../../state/NotesDirtyContext';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import type { PrEntry } from '../../types/pr-data.ts';
import { PrNotesTab } from './PrNotesTab';

jest.mock('../../helpers/pr-http.helpers.ts', () => ({ postJson: jest.fn() }));
const mockPost = postJson as jest.MockedFunction<typeof postJson>;

const render = (ui: ReactNode, setNotesDirty: (prNumber: string, dirty: boolean) => void = () => {}) =>
  baseRender(
    <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} } as never}>
      <NotesDirtyContext.Provider value={{ dirtyPrNumbers: [], setNotesDirty } as never}>{ui}</NotesDirtyContext.Provider>
    </RequestActivityContext.Provider>,
  );

const savedEntry = (): PrEntry => ({
  repo: 'owner/repo',
  prNumber: '42',
  notes: {
    comments: [{ id: 'c1', author: 'alice', tone: 'Positive', note: 'Clear tests' }],
    otherNotes: 'Talked it over',
    prDifficulty: '3',
    stories: [
      { name: 'US1', url: 'https://stories.example/US1' },
      { name: '', url: 'https://stories.example/US2' },
      { name: 'US3', url: 'javascript:alert(1)' },
    ],
    analysisOfPr: '',
  },
});

const pr = { number: '42' };
const field = (label: string) => screen.getByRole('group', { name: label });
const okSave = (prData?: object) => mockPost.mockResolvedValue({ response: { ok: true } as Response, result: { ok: true, prData } });
const lastPayload = () => mockPost.mock.calls.at(-1)?.[1] as Record<string, unknown>;

afterEach(() => mockPost.mockReset());

describe('PrNotesTab read view', () => {
  test('shows each field read-only, in a group named by the PR, with an Edit button (Add when empty)', () => {
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    expect(screen.getByRole('group', { name: 'Notes for PR #42' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    expect(field('Other notes')).toHaveTextContent('Talked it over');
    expect(field('PR difficulty')).toHaveTextContent('3 - Moderate');
    expect(field('Analysis of PR')).toHaveTextContent('None');
    expect(within(field('Other notes')).getByRole('button', { name: 'Edit other notes' })).toBeInTheDocument();
    expect(within(field('Analysis of PR')).getByRole('button', { name: 'Add analysis of PR' })).toBeInTheDocument();
  });

  test('a comment shows its author, tone and note', () => {
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    const comment = within(field('Comments')).getByRole('listitem');
    expect(comment).toHaveTextContent('alice');
    expect(comment).toHaveTextContent('Positive');
    expect(comment).toHaveTextContent('Clear tests');
  });

  test('each story shows its name (else its URL) with a button opening its link - only for a web address', () => {
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    const stories = within(field('Stories')).getAllByRole('listitem');
    expect(stories.map((story) => story.textContent)).toEqual(['US1', 'https://stories.example/US2', 'US3']);
    expect(within(stories[0]!).getByRole('link', { name: 'Open US1' })).toHaveAttribute('href', 'https://stories.example/US1');
    expect(within(stories[0]!).getByRole('link', { name: 'Open US1' })).toHaveAttribute('target', '_blank');
    expect(within(stories[1]!).getByRole('link', { name: 'Open https://stories.example/US2' })).toBeInTheDocument();
    expect(within(stories[2]!).queryByRole('link')).not.toBeInTheDocument();
  });

  test('no notes: every field empty, difficulty "Not set"', () => {
    render(<PrNotesTab entry={{}} pr={{ number: '1' }} />);
    expect(field('PR difficulty')).toHaveTextContent('Not set');
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(5);
  });
});

describe('PrNotesTab editing', () => {
  test('Edit turns the field into inputs, focused, with Save (enabled once changed) and Cancel', async () => {
    const user = userEvent.setup();
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    const textarea = within(field('Other notes')).getByRole('textbox', { name: 'Other notes' });
    expect(textarea).toHaveValue('Talked it over');
    expect(textarea).toHaveFocus();
    const save = screen.getByRole('button', { name: 'Save other notes' });
    expect(save).toBeDisabled();
    await user.type(textarea, '!');
    expect(save).toBeEnabled();
  });

  test('Cancel drops the edit and puts focus back on Edit', async () => {
    const user = userEvent.setup();
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    await user.type(screen.getByRole('textbox', { name: 'Other notes' }), ' and more');
    await user.click(within(field('Other notes')).getByRole('button', { name: 'Cancel' }));
    expect(field('Other notes')).toHaveTextContent(/^Other notesEditTalked it over$/);
    expect(screen.getByRole('button', { name: 'Edit other notes' })).toHaveFocus();
  });

  test('saving a field sends it with the others as saved - another field\'s unsaved edit stays a draft', async () => {
    const user = userEvent.setup();
    okSave();
    const entry = savedEntry();
    render(<PrNotesTab entry={entry} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    await user.type(screen.getByRole('textbox', { name: 'Other notes' }), ' (draft)');
    await user.click(screen.getByRole('button', { name: 'Add analysis of PR' }));
    await user.type(screen.getByRole('textbox', { name: 'Analysis of PR' }), 'Solid');
    await user.click(screen.getByRole('button', { name: 'Save analysis of PR' }));

    await waitFor(() => expect(field('Analysis of PR')).toHaveTextContent('Saved.'));
    expect(mockPost).toHaveBeenCalledWith(
      '/view-prs/notes',
      expect.objectContaining({ prNumber: '42', repo: 'owner/repo', analysisOfPr: 'Solid', otherNotes: 'Talked it over', prDifficulty: '3' }),
    );
    // Stories are sent as stored.
    expect(lastPayload().stories).toHaveLength(3);
    expect(field('Analysis of PR')).toHaveTextContent('Solid');
    expect(screen.getByRole('button', { name: 'Edit analysis of PR' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Other notes' })).toHaveValue('Talked it over (draft)');
    expect(entry.notes?.analysisOfPr).toBe('Solid');
  });

  test('only a changed field\'s Save is enabled (the "Auto update paused" chip focuses the first enabled one)', async () => {
    const user = userEvent.setup();
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    await user.click(screen.getByRole('button', { name: 'Edit PR difficulty' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'PR difficulty' }), '5');
    expect(document.querySelector('.pr-notes-section[data-pr-number="42"] .pr-notes-save:not([disabled])')).toHaveAccessibleName('Save PR difficulty');
  });

  test('a failed save says so and keeps the edit', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ response: { ok: false } as Response, result: { ok: false, error: 'disk full' } });
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit PR difficulty' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'PR difficulty' }), '5');
    await user.click(screen.getByRole('button', { name: 'Save PR difficulty' }));
    await waitFor(() => expect(field('PR difficulty')).toHaveTextContent('Save failed: disk full'));
    expect(screen.getByRole('combobox', { name: 'PR difficulty' })).toHaveValue('5');
  });

  test('a save that returns refreshed data passes it on', async () => {
    const user = userEvent.setup();
    const prData = { byPrNumber: {} };
    okSave(prData);
    const onDataRefresh = jest.fn();
    render(<PrNotesTab entry={savedEntry()} pr={pr} onDataRefresh={onDataRefresh} />);
    await user.click(screen.getByRole('button', { name: 'Edit PR difficulty' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'PR difficulty' }), '1');
    await user.click(screen.getByRole('button', { name: 'Save PR difficulty' }));
    await waitFor(() => expect(onDataRefresh).toHaveBeenCalledWith(prData));
  });

  test('stories: edit, save, and the read view lists them', async () => {
    const user = userEvent.setup();
    okSave();
    render(<PrNotesTab entry={{}} pr={{ number: '1' }} />);
    await user.click(screen.getByRole('button', { name: 'Add stories' }));
    const name = screen.getByRole('textbox', { name: 'Story 1 name' });
    expect(name).toHaveFocus();
    await user.type(name, 'US9');
    await user.click(screen.getByRole('button', { name: 'Save stories' }));
    await waitFor(() => expect(within(field('Stories')).getByRole('listitem')).toHaveTextContent('US9'));
    expect(lastPayload().stories).toEqual([{ name: 'US9', url: '' }]);
  });
});

describe('PrNotesTab comments', () => {
  test('Add on no comments starts with one row, its author focused; each row\'s fields are named', async () => {
    const user = userEvent.setup();
    render(<PrNotesTab entry={{}} pr={{ number: '1' }} />);
    await user.click(screen.getByRole('button', { name: 'Add comments' }));
    expect(screen.getByRole('combobox', { name: 'Comment 1 author' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Comment 1 tone' })).toHaveValue('Neutral');
    // A blank row isn't a change: nothing to save, nothing unsaved.
    expect(screen.getByRole('button', { name: 'Save comments' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Comment 1 note' }), 'Hi');
    expect(screen.getByRole('button', { name: 'Save comments' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    expect(screen.getByRole('combobox', { name: 'Comment 2 author' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove comment 1' }));
    expect(screen.queryByRole('combobox', { name: 'Comment 2 author' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add comment' })).toHaveFocus();
  });

  test('editing keeps a stored author selected, and saving sends the comments with their ids', async () => {
    const user = userEvent.setup();
    okSave();
    render(<PrNotesTab entry={savedEntry()} pr={{ number: '42', authorLogin: 'alice' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit comments' }));
    expect(screen.getByRole('combobox', { name: 'Comment 1 author' })).toHaveValue('alice');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Comment 1 tone' }), 'Negative');
    await user.click(screen.getByRole('button', { name: 'Save comments' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(lastPayload().comments).toEqual([{ id: 'c1', author: 'alice', tone: 'Negative', note: 'Clear tests' }]);
  });
});

describe('PrNotesTab saving', () => {
  test('says "Saving…" in the field\'s status while the save is in flight', async () => {
    const user = userEvent.setup();
    let finish: (value: Awaited<ReturnType<typeof postJson>>) => void = () => {};
    mockPost.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<PrNotesTab entry={savedEntry()} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit PR difficulty' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'PR difficulty' }), '5');
    await user.click(screen.getByRole('button', { name: 'Save PR difficulty' }));
    expect(within(field('PR difficulty')).getByRole('status')).toHaveTextContent('Saving…');
    expect(screen.getByRole('button', { name: 'Save PR difficulty' })).toHaveTextContent(/^Save$/);
    finish({ response: { ok: true } as Response, result: { ok: true } });
    await waitFor(() => expect(within(field('PR difficulty')).getByRole('status')).toHaveTextContent('Saved.'));
  });

  test('saving a comment drops blank rows', async () => {
    const user = userEvent.setup();
    okSave();
    render(<PrNotesTab entry={savedEntry()} pr={{ number: '42', authorLogin: 'alice' }} />);
    await user.click(screen.getByRole('button', { name: 'Edit comments' }));
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Comment 1 note' }), '!');
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await user.click(screen.getByRole('button', { name: 'Save comments' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(lastPayload().comments).toEqual([{ id: 'c1', author: 'alice', tone: 'Positive', note: 'Clear tests!' }]);
  });

  test('takes in notes that change under it, keeps a field being edited as typed, and saves with the new values', async () => {
    const user = userEvent.setup();
    okSave();
    const entry = savedEntry();
    const { rerender } = render(<PrNotesTab entry={entry} pr={pr} />);
    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    await user.type(screen.getByRole('textbox', { name: 'Other notes' }), ' (mine)');

    // A refresh brings notes saved elsewhere.
    const refreshed: PrEntry = { ...entry, notes: { ...entry.notes, prDifficulty: '5', analysisOfPr: 'From another window' } };
    rerender(
      <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} } as never}>
        <NotesDirtyContext.Provider value={{ dirtyPrNumbers: [], setNotesDirty: () => {} } as never}>
          <PrNotesTab entry={refreshed} pr={pr} />
        </NotesDirtyContext.Provider>
      </RequestActivityContext.Provider>,
    );
    expect(field('PR difficulty')).toHaveTextContent('5 - Very difficult');
    expect(field('Analysis of PR')).toHaveTextContent('From another window');
    expect(screen.getByRole('textbox', { name: 'Other notes' })).toHaveValue('Talked it over (mine)');

    await user.click(screen.getByRole('button', { name: 'Save other notes' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(lastPayload()).toMatchObject({ otherNotes: 'Talked it over (mine)', prDifficulty: '5', analysisOfPr: 'From another window' });
  });
});

describe('PrNotesTab unsaved state (NotesDirtyContext)', () => {
  test('marks the PR only while a draft differs from what is saved, and clears it on unmount', async () => {
    const user = userEvent.setup();
    const setNotesDirty = jest.fn();
    const { unmount } = render(<PrNotesTab entry={savedEntry()} pr={pr} />, setNotesDirty);
    expect(setNotesDirty).toHaveBeenLastCalledWith('42', false);

    await user.click(screen.getByRole('button', { name: 'Edit other notes' }));
    expect(setNotesDirty).toHaveBeenLastCalledWith('42', false);
    await user.type(screen.getByRole('textbox', { name: 'Other notes' }), '!');
    expect(setNotesDirty).toHaveBeenLastCalledWith('42', true);

    setNotesDirty.mockClear();
    unmount();
    expect(setNotesDirty).toHaveBeenCalledWith('42', false);
  });
});
