/** @jest-environment jsdom */

const { render, cleanup, fireEvent, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { NotesDirtyProvider } = require('./NotesDirtyProvider');
const { NotesSection } = require('./insights/NotesSection');

// Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): closes a real
// coverage gap - no existing test exercised the actual wiring between a
// real NotesSection instance and index.page.js's window.getDirtyNotesPrNumbers
// bridge (NotesSection.test.jsx tests NotesSection in isolation with a mock
// setNotesDirty; this mounts the real Provider too). This is exactly the
// class of gap that let a prior auto-render-blocking bug (the
// getBlockingAuthorInsightsLogins bare-shorthand-property bug, see
// REACT_MIGRATION_PLAN.md's sub-phase 7.0 writeup) go unnoticed.
describe('NotesDirtyProvider + NotesSection wiring', () => {
  afterEach(() => {
    delete window.postJson;
    delete window.getDirtyNotesPrNumbers;
    cleanup();
  });

  test('given a real NotesSection edited inside a real NotesDirtyProvider, when it becomes dirty, then window.getDirtyNotesPrNumbers reflects it', () => {
    render(
      <NotesDirtyProvider>
        <NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    expect(window.getDirtyNotesPrNumbers()).toEqual([]);

    fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'a note' } });

    expect(window.getDirtyNotesPrNumbers()).toEqual(['42']);
  });

  test('given two dirty NotesSection instances for different PRs, when read, then both PR numbers are reported', () => {
    render(
      <NotesDirtyProvider>
        <NotesSection entry={{}} pr={{ number: '10' }} actorsMap={{}} />
        <NotesSection entry={{}} pr={{ number: '2' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    const textareas = screen.getAllByPlaceholderText('Other notes...');
    fireEvent.change(textareas[0], { target: { value: 'first' } });
    fireEvent.change(textareas[1], { target: { value: 'second' } });

    expect(window.getDirtyNotesPrNumbers()).toEqual(['2', '10']);
  });

  test('given a dirty NotesSection that becomes clean again, when read, then the PR number is removed', () => {
    render(
      <NotesDirtyProvider>
        <NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    const textarea = screen.getByPlaceholderText('Other notes...');
    fireEvent.change(textarea, { target: { value: 'a note' } });
    expect(window.getDirtyNotesPrNumbers()).toEqual(['42']);

    fireEvent.change(textarea, { target: { value: '' } });
    expect(window.getDirtyNotesPrNumbers()).toEqual([]);
  });

  test('given a dirty NotesSection, when the provider unmounts entirely, then the bridge is removed', () => {
    const { unmount } = render(
      <NotesDirtyProvider>
        <NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    expect(typeof window.getDirtyNotesPrNumbers).toBe('function');
    unmount();
    expect(window.getDirtyNotesPrNumbers).toBeUndefined();
  });
});
