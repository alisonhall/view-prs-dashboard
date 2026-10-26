/** @jest-environment jsdom */

const { render: baseRender, cleanup, fireEvent, screen, within } = require('@testing-library/react');
const { RequestActivityContext } = require('../state/RequestActivityContext');

// PrNotesTab (rendered for real here) reads beginRequestActivity from
// RequestActivityContext.
const render = (ui, options) =>
  baseRender(
    <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} }}>{ui}</RequestActivityContext.Provider>,
    options,
  );
require('@testing-library/jest-dom');
const { NotesDirtyProvider } = require('./NotesDirtyProvider');
const { useNotesDirty } = require('../state/NotesDirtyContext');

// Reads the dirty set from Context (what AutoRenderBlockingSync reads) - it
// was window.getDirtyNotesPrNumbers, deleted.
let dirtyPrNumbers;
function DirtyProbe() {
  dirtyPrNumbers = useNotesDirty().dirtyPrNumbers;
  return null;
}
const readDirty = () => dirtyPrNumbers;
const { PrNotesTab } = require('./pane/PrNotesTab');

// The wiring between a real Notes tab and the dirty set this Provider
// exposes (read by AutoRenderBlockingSync - see
// AutoRenderBlockingSync.test.jsx). PrNotesTab.test.tsx tests the tab with
// a mock setNotesDirty; this mounts the real Provider too - the class of
// gap that once let an auto-render-blocking bug go unnoticed.
describe('NotesDirtyProvider + PrNotesTab wiring', () => {
  afterEach(() => {
    dirtyPrNumbers = undefined;
    cleanup();
  });

  // Opens a PR's Other notes for editing and types into it.
  const editOtherNotes = (prNumber, value) => {
    const notes = screen.getByRole('group', { name: `Notes for PR #${prNumber}` });
    const add = within(notes).queryByRole('button', { name: 'Add other notes' });
    if (add) fireEvent.click(add);
    fireEvent.change(within(notes).getByRole('textbox', { name: 'Other notes' }), { target: { value } });
  };

  test('given a real Notes tab edited inside a real NotesDirtyProvider, when it becomes dirty, then the Context dirty set reflects it', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <PrNotesTab entry={{}} pr={{ number: '42' }} />
      </NotesDirtyProvider>,
    );

    expect(readDirty()).toEqual([]);
    editOtherNotes('42', 'a note');
    expect(readDirty()).toEqual(['42']);
  });

  test('given two dirty Notes tabs for different PRs, when read, then both PR numbers are reported', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <PrNotesTab entry={{}} pr={{ number: '10' }} />
        <PrNotesTab entry={{}} pr={{ number: '2' }} />
      </NotesDirtyProvider>,
    );

    editOtherNotes('10', 'first');
    editOtherNotes('2', 'second');
    expect(readDirty()).toEqual(['2', '10']);
  });

  test('given a dirty Notes tab whose edit is undone, when read, then the PR number is removed', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <PrNotesTab entry={{}} pr={{ number: '42' }} />
      </NotesDirtyProvider>,
    );

    editOtherNotes('42', 'a note');
    expect(readDirty()).toEqual(['42']);
    editOtherNotes('42', '');
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
