/** @jest-environment jsdom */

const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { NotesSection } = require('./NotesSection');
const { NotesDirtyContext } = require('../../state/NotesDirtyContext');

function installDefaultHelpers() {
  window.asArray = (v) => (Array.isArray(v) ? v : []);
}

function clearHelpers() {
  ['asArray', 'postJson'].forEach((key) => delete window[key]);
}

function renderWithNotesDirty(ui, { setNotesDirty = () => {} } = {}) {
  return render(
    <NotesDirtyContext.Provider value={{ dirtyPrNumbers: [], setNotesDirty }}>
      {ui}
    </NotesDirtyContext.Provider>,
  );
}

describe('NotesSection', () => {
  beforeEach(installDefaultHelpers);
  afterEach(clearHelpers);

  test('given no existing notes, when rendering, then the Save button starts disabled', () => {
    render(<NotesSection entry={{}} pr={{ number: '1' }} actorsMap={{}} />);
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
  });

  test('given the Other Notes field, when edited, then the Save button becomes enabled', () => {
    render(<NotesSection entry={{}} pr={{ number: '1' }} actorsMap={{}} />);
    const textarea = screen.getByPlaceholderText('Other notes...');
    textarea.focus();
    require('@testing-library/react').fireEvent.change(textarea, { target: { value: 'a note' } });
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeEnabled();
  });

  test('given the "+ Add comment" button, when clicked, then adds a new comment row with an author dropdown', () => {
    render(<NotesSection entry={{}} pr={{ number: '1' }} actorsMap={{}} />);
    expect(document.querySelectorAll('.pr-notes-comment-row')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '+ Add comment' }));
    expect(document.querySelectorAll('.pr-notes-comment-row')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeEnabled();
  });

  test('given an existing comment authored by a known person, when rendering, then pre-selects that author', () => {
    const entry = { notes: { comments: [{ id: 'c1', author: 'alice', tone: 'Positive', note: 'nice work' }] } };
    render(<NotesSection entry={entry} pr={{ number: '1' }} actorsMap={{}} />);
    expect(screen.getByDisplayValue('nice work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
  });

  test('given unsaved changes, when Save notes is clicked, then POSTs to /view-prs/notes with the current field values', async () => {
    const postJson = jest.fn().mockResolvedValue({ response: { ok: true }, result: { ok: true } });
    window.postJson = postJson;
    const entry = { repo: 'owner/repo' };
    render(<NotesSection entry={entry} pr={{ number: '42' }} actorsMap={{}} />);

    require('@testing-library/react').fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'analysis notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(postJson).toHaveBeenCalledWith(
      '/view-prs/notes',
      expect.objectContaining({ prNumber: '42', repo: 'owner/repo', otherNotes: 'analysis notes' }),
    );
  });

  test('given a successful save that returns prData, when it resolves, then calls onDataRefresh with it', async () => {
    const prData = { byPrNumber: {} };
    window.postJson = jest.fn().mockResolvedValue({ response: { ok: true }, result: { ok: true, prData } });
    const onDataRefresh = jest.fn();
    render(<NotesSection entry={{}} pr={{ number: '1' }} actorsMap={{}} onDataRefresh={onDataRefresh} />);

    require('@testing-library/react').fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(onDataRefresh).toHaveBeenCalledWith(prData);
  });

  // Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): dirty state is
  // now reported via NotesDirtyContext's setNotesDirty, replacing the old
  // data-has-unsaved-notes DOM attribute + direct
  // window.recomputeDirtyPrSectionsFields() call.
  describe('dirty-state reporting (NotesDirtyContext)', () => {
    test('given an edit that makes the section dirty, when it renders, then setNotesDirty is called with the PR number and true', () => {
      const setNotesDirty = jest.fn();
      renderWithNotesDirty(<NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />, { setNotesDirty });

      fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'a note' } });

      expect(setNotesDirty).toHaveBeenLastCalledWith('42', true);
    });

    test('given no edits, when it renders, then setNotesDirty is called with false', () => {
      const setNotesDirty = jest.fn();
      renderWithNotesDirty(<NotesSection entry={{}} pr={{ number: '7' }} actorsMap={{}} />, { setNotesDirty });

      expect(setNotesDirty).toHaveBeenCalledWith('7', false);
    });

    test('given a dirty section, when it unmounts, then setNotesDirty is called one last time with false', () => {
      const setNotesDirty = jest.fn();
      renderWithNotesDirty(<NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />, { setNotesDirty });

      fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'a note' } });
      setNotesDirty.mockClear();

      cleanup();

      expect(setNotesDirty).toHaveBeenCalledWith('42', false);
    });

    test('given no NotesDirtyProvider ancestor, when rendering and editing, then it does not throw (safe default Context)', () => {
      render(<NotesSection entry={{}} pr={{ number: '1' }} actorsMap={{}} />);

      expect(() =>
        fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'a note' } }),
      ).not.toThrow();
    });
  });
});
