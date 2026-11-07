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
// was window.getDirtyNotesPrKeys, deleted.
let dirtyPrKeys;
function DirtyProbe() {
  dirtyPrKeys = useNotesDirty().dirtyPrKeys;
  return null;
}
const readDirty = () => dirtyPrKeys;
const { PrNotesTab } = require('./pane/PrNotesTab');

// The wiring between a real Notes tab and the dirty set this Provider
// exposes (read by AutoRenderBlockingSync - see
// AutoRenderBlockingSync.test.jsx). PrNotesTab.test.tsx tests the tab with
// a mock setNotesDirty; this mounts the real Provider too - the class of
// gap that once let an auto-render-blocking bug go unnoticed.
describe('NotesDirtyProvider + PrNotesTab wiring', () => {
  afterEach(() => {
    dirtyPrKeys = undefined;
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
        <PrNotesTab entry={{ repo: 'acme/api' }} pr={{ number: '42' }} />
      </NotesDirtyProvider>,
    );

    expect(readDirty()).toEqual([]);
    editOtherNotes('42', 'a note');
    expect(readDirty()).toEqual(['acme/api#42']);
  });

  test('given two dirty Notes tabs for different PRs, when read, then both are reported by repo and number', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <PrNotesTab entry={{ repo: 'acme/web' }} pr={{ number: '10' }} />
        <PrNotesTab entry={{ repo: 'acme/api' }} pr={{ number: '2' }} />
      </NotesDirtyProvider>,
    );

    editOtherNotes('10', 'first');
    editOtherNotes('2', 'second');
    expect(readDirty()).toEqual(['acme/api#2', 'acme/web#10']);
  });

  test('given a dirty Notes tab whose edit is undone, when read, then the PR is removed', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
        <PrNotesTab entry={{ repo: 'acme/api' }} pr={{ number: '42' }} />
      </NotesDirtyProvider>,
    );

    editOtherNotes('42', 'a note');
    expect(readDirty()).toEqual(['acme/api#42']);
    editOtherNotes('42', '');
    expect(readDirty()).toEqual([]);
  });

  test('given the provider mounts, when window is checked, then it publishes no dirty-notes bridge', () => {
    render(
      <NotesDirtyProvider>
        <DirtyProbe />
      </NotesDirtyProvider>,
    );

    expect(window.getDirtyNotesPrKeys).toBeUndefined();
  });
});
