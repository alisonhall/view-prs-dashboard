/** @jest-environment jsdom */

const { render: baseRender, cleanup, fireEvent, screen } = require('@testing-library/react');
const { RequestActivityContext } = require('../state/RequestActivityContext');

// NotesSection (rendered for real by this file's rows) reads
// beginRequestActivity from usePrData() now, not window.beginRequestActivity
// (see WINDOW_BRIDGE_ELIMINATION_PLAN.md).
const render = (ui, options) =>
  baseRender(
    <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} }}>{ui}</RequestActivityContext.Provider>,
    options,
  );
require('@testing-library/jest-dom');
const { NotesDirtyProvider } = require('./NotesDirtyProvider');
const { useNotesDirty } = require('../state/NotesDirtyContext');

// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads the
// dirty set from Context (what AutoRenderBlockingSync reads) - it was
// window.getDirtyNotesPrNumbers, deleted.
let dirtyPrNumbers;
function DirtyProbe() {
  dirtyPrNumbers = useNotesDirty().dirtyPrNumbers;
  return null;
}
const readDirty = () => dirtyPrNumbers;
const { NotesSection } = require('./insights/NotesSection');

// Phase 7, sub-phase 7.5 (see REACT_MIGRATION_PLAN.md): closes a real
// coverage gap - no existing test exercised the actual wiring between a
// real NotesSection instance and the dirty set this Provider exposes (read by
// AutoRenderBlockingSync - see AutoRenderBlockingSync.test.jsx; it was the
// window.getDirtyNotesPrNumbers bridge). NotesSection.test.jsx tests
// NotesSection in isolation with a mock setNotesDirty; this mounts the real
// Provider too. This is exactly the
// class of gap that let a prior auto-render-blocking bug (the
// getBlockingAuthorInsightsLogins bare-shorthand-property bug, see
// REACT_MIGRATION_PLAN.md's sub-phase 7.0 writeup) go unnoticed.
describe('NotesDirtyProvider + NotesSection wiring', () => {
  afterEach(() => {
    delete window.postJson;
    dirtyPrNumbers = undefined;
    cleanup();
  });

  test('given a real NotesSection edited inside a real NotesDirtyProvider, when it becomes dirty, then the Context dirty set reflects it', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    expect(readDirty()).toEqual([]);

    fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'a note' } });

    expect(readDirty()).toEqual(['42']);
  });

  test('given two dirty NotesSection instances for different PRs, when read, then both PR numbers are reported', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <NotesSection entry={{}} pr={{ number: '10' }} actorsMap={{}} />
        <NotesSection entry={{}} pr={{ number: '2' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    const textareas = screen.getAllByPlaceholderText('Other notes...');
    fireEvent.change(textareas[0], { target: { value: 'first' } });
    fireEvent.change(textareas[1], { target: { value: 'second' } });

    expect(readDirty()).toEqual(['2', '10']);
  });

  test('given a dirty NotesSection that becomes clean again, when read, then the PR number is removed', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <NotesSection entry={{}} pr={{ number: '42' }} actorsMap={{}} />
      </NotesDirtyProvider>,
    );

    const textarea = screen.getByPlaceholderText('Other notes...');
    fireEvent.change(textarea, { target: { value: 'a note' } });
    expect(readDirty()).toEqual(['42']);

    fireEvent.change(textarea, { target: { value: '' } });
    expect(readDirty()).toEqual([]);
  });

  test('given the provider mounts, when window is checked, then it publishes no dirty-notes bridge', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
      </NotesDirtyProvider>,
    );

    expect(window.getDirtyNotesPrNumbers).toBeUndefined();
  });
});
