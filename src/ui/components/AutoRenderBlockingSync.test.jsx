/** @jest-environment jsdom */

const React = require('react');
const { render, act, cleanup } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AutoRenderBlockingSync } = require('./AutoRenderBlockingSync');
const { AutoRenderBlockingProvider } = require('./AutoRenderBlockingProvider');
const { NotesDirtyProvider } = require('./NotesDirtyProvider');
const { AuthorInsightsDraftsProvider } = require('./AuthorInsightsDraftsProvider');
const { PrDataProvider } = require('../state/PrDataProvider');
const { useNotesDirty } = require('../state/NotesDirtyContext');
const { useAuthorInsightsDrafts } = require('../state/AuthorInsightsDraftsContext');
const { useAutoRenderBlocking, useAutoRenderBlockingActions } = require('../state/AutoRenderBlockingContext');

// Window-bridge elimination Phase 7.4: AutoRenderBlockingSync replaces
// index.page.js's recomputeDirtyPrSectionsFields. These mount it the way
// react-app.jsx does (inside AutoRenderBlockingProvider > PrDataProvider >
// NotesDirtyProvider > AuthorInsightsDraftsProvider) and drive the real
// Providers' own write functions.
let notesDirty;
let drafts;
let blockingActions;
let blocking;
let blockingRenders = 0;
function Handles() {
  notesDirty = useNotesDirty();
  drafts = useAuthorInsightsDrafts();
  blockingActions = useAutoRenderBlockingActions();
  return null;
}
const BlockingProbe = React.memo(function BlockingProbe() {
  blocking = useAutoRenderBlocking();
  blockingRenders += 1;
  return null;
});

const renderSync = ({ actorsMap = {} } = {}) =>
  render(
    <AutoRenderBlockingProvider>
      <PrDataProvider initialPayload={{ byPrNumber: {}, actorsMap }} initialSelectedRepo="">
        <NotesDirtyProvider>
          <AuthorInsightsDraftsProvider>
            <AutoRenderBlockingSync />
            <Handles />
            <BlockingProbe />
          </AuthorInsightsDraftsProvider>
        </NotesDirtyProvider>
      </PrDataProvider>
    </AutoRenderBlockingProvider>,
  );

describe('AutoRenderBlockingSync', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="auto-render-blocked-indicator" hidden></div>';
  });

  afterEach(() => {
    cleanup();
    blockingRenders = 0;
    delete window.setPendingAutoRenderPayload;
    delete window.getDirtyNotesPrNumbers;
    delete window.getAuthorInsightsDraftsSnapshot;
  });

  test('given nothing is unsaved, when mounted, then the blocking state is empty and nothing blocks', () => {
    renderSync();

    expect(blocking.blockingPrNumbers).toEqual([]);
    expect(blocking.blockingAuthorInsightsLogins).toEqual([]);
    expect(blockingActions.getHasDirtyPrSectionsFields()).toBe(false);
  });

  test('given PR notes become dirty, when the sync recomputes, then the PRs are reported in order with their label, and a pending poll is held back', () => {
    renderSync();

    act(() => {
      notesDirty.setNotesDirty('42', true);
      notesDirty.setNotesDirty('7', true);
    });

    expect(blocking.blockingPrNumbers).toEqual(['7', '42']);
    expect(blocking.blockingPrLabel).toBe('Blocking PRs: #7, #42');
    expect(blockingActions.getHasDirtyPrSectionsFields()).toBe(true);

    act(() => {
      blockingActions.setPendingAutoRenderPayload({ byPrNumber: {} });
    });
    expect(blocking.isBlocked).toBe(true);
    expect(blocking.statusText).toContain('2 note sections unsaved');
  });

  test('given a dirty note is saved (clean again) while a poll is pending, when the sync recomputes, then the pending payload is applied', async () => {
    const applier = jest.fn();
    renderSync();
    act(() => {
      blockingActions.setFreshPayloadApplier(applier);
      notesDirty.setNotesDirty('42', true);
    });
    const payload = { byPrNumber: { 42: {} } };
    act(() => {
      blockingActions.setPendingAutoRenderPayload(payload);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(applier).not.toHaveBeenCalledWith(payload);

    act(() => {
      notesDirty.setNotesDirty('42', false);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(applier).toHaveBeenCalledWith(payload);
    expect(blocking.blockingPrNumbers).toEqual([]);
    expect(blocking.isBlocked).toBe(false);
  });

  test('given an unsaved composer draft, when the sync recomputes, then that author blocks, and clearing the draft unblocks', () => {
    renderSync();

    act(() => {
      drafts.updateComposerDraft('octocat', { note: 'unsaved draft' });
    });
    expect(blocking.blockingAuthorInsightsLogins).toEqual(['octocat']);
    expect(blockingActions.getHasDirtyPrSectionsFields()).toBe(true);

    act(() => {
      drafts.resetComposerDraft('octocat');
    });
    expect(blocking.blockingAuthorInsightsLogins).toEqual([]);
    expect(blockingActions.getHasDirtyPrSectionsFields()).toBe(false);
  });

  test('given an open edit draft that differs from the saved comment, when the sync recomputes, then that author blocks (it reads the saved comments from the drafts Context)', () => {
    renderSync();

    act(() => {
      drafts.setManualComments('octocat', [{ id: 'c1', note: 'Original', sentiment: 'neutral' }]);
      drafts.updateEditDraft('octocat', 'c1', { note: 'Original', sentiment: 'neutral', isEditing: true });
    });
    expect(blocking.blockingAuthorInsightsLogins).toEqual([]);

    act(() => {
      drafts.updateEditDraft('octocat', 'c1', { note: 'Changed', sentiment: 'neutral', isEditing: true });
    });
    expect(blocking.blockingAuthorInsightsLogins).toEqual(['octocat']);
  });

  test('given two blocking authors, when the sync recomputes, then they are ordered by display name from the payload actorsMap, not by login', () => {
    renderSync({ actorsMap: { amy: 'Zoe Amy', zed: 'Aaron Zed' } });

    act(() => {
      drafts.updateComposerDraft('amy', { note: 'a' });
      drafts.updateComposerDraft('zed', { note: 'b' });
    });

    expect(blocking.blockingAuthorInsightsLogins).toEqual(['zed', 'amy']);
  });

  test('given further keystrokes that do not change which authors block, when the drafts version bumps, then AutoRenderBlockingProvider is not pushed again (its consumers do not re-render)', () => {
    renderSync();
    act(() => {
      drafts.updateComposerDraft('octocat', { note: 'a' });
    });
    const rendersAfterFirstChange = blockingRenders;

    for (const note of ['ab', 'abc', 'abcd']) {
      act(() => {
        drafts.updateComposerDraft('octocat', { note });
      });
    }

    expect(blocking.blockingAuthorInsightsLogins).toEqual(['octocat']);
    expect(blockingRenders).toBe(rendersAfterFirstChange);
  });
});
