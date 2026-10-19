/** @jest-environment jsdom */

const { render, cleanup, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsDraftsProvider } = require('./AuthorInsightsDraftsProvider');
const { useAuthorInsightsDrafts } = require('../state/AuthorInsightsDraftsContext');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrAutoRenderBlockingHelpers } = require('../helpers/pr-auto-render-blocking.helpers.js');

// Phase 7 (see REACT_MIGRATION_PLAN.md): closes a real coverage gap for
// the same class of bug flagged in NotesDirtyProvider.test.jsx's own
// comment (the getBlockingAuthorInsightsLogins bare-shorthand-property
// bug) - no existing test exercises the real wiring between a real
// AuthorInsightsDraftsProvider instance and the window.* bridge
// pr-auto-render-blocking.helpers.js actually reads.
let probeValue;
function Probe() {
  probeValue = useAuthorInsightsDrafts();
  return null;
}

// Phase H.15 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 2): AuthorInsightsDraftsProvider now also reads
// usePrData().beginRequestActivity (for its new saveManualComment/
// updateManualComment) - needs a real <PrDataProvider> ancestor, which
// this probe didn't require before.
const renderProbe = () =>
  render(
    <PrDataProvider>
      <AuthorInsightsDraftsProvider>
        <Probe />
      </AuthorInsightsDraftsProvider>
    </PrDataProvider>,
  );

describe('AuthorInsightsDraftsProvider', () => {
  afterEach(() => {
    delete window.getAuthorInsightsComposerDraft;
    delete window.updateAuthorInsightsComposerDraft;
    delete window.resetAuthorInsightsComposerDraft;
    delete window.getAuthorInsightsEditDraft;
    delete window.getAuthorInsightsEditDraftMap;
    delete window.updateAuthorInsightsEditDraft;
    delete window.resetAuthorInsightsEditDraft;
    delete window.getAuthorManualCommentsForLogin;
    delete window.setAuthorInsightsManualComments;
    delete window.getAuthorInsightsManualCommentsLoadState;
    delete window.loadAuthorManualComments;
    delete window.getAuthorInsightsDraftsSnapshot;
    delete window.recomputeDirtyPrSectionsFields;
    probeValue = undefined;
    cleanup();
  });

  test('given a composer draft update via Context, when read back via the window bridge, then it reflects the same value', () => {
    renderProbe();

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'hello', sentiment: 'positive' });
    });

    expect(window.getAuthorInsightsComposerDraft('octocat')).toEqual({
      note: 'hello',
      sentiment: 'positive',
    });
  });

  test('given a composer draft update, when written, then window.recomputeDirtyPrSectionsFields is called', () => {
    window.recomputeDirtyPrSectionsFields = jest.fn();
    renderProbe();

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'hello' });
    });

    expect(window.recomputeDirtyPrSectionsFields).toHaveBeenCalled();
  });

  test('given an edit draft update via Context, when read back via the window bridge, then it reflects the same value', () => {
    renderProbe();

    act(() => {
      probeValue.updateEditDraft('octocat', 'c1', { note: 'edited', sentiment: 'negative', isEditing: true });
    });

    expect(window.getAuthorInsightsEditDraftMap('octocat')).toEqual({
      c1: { note: 'edited', sentiment: 'negative', isEditing: true },
    });
  });

  test('given manual comments set via the window bridge, when read via Context, then they round-trip', () => {
    renderProbe();

    act(() => {
      window.setAuthorInsightsManualComments('octocat', [{ id: 'c1', note: 'x' }]);
    });

    expect(probeValue.getManualComments('octocat')).toEqual([{ id: 'c1', note: 'x' }]);
  });

  test('given a dirty composer draft, when window.getAuthorInsightsDraftsSnapshot feeds the real getBlockingAuthorInsightsLogins, then that author is reported as blocking', () => {
    const { getBlockingAuthorInsightsLogins } = createPrAutoRenderBlockingHelpers({
      isAuthorInsightsComposerDraftDirty: (draft) => Boolean(String(draft?.note || '').trim()),
      getAuthorManualCommentsForLogin: () => [],
      isAuthorInsightsEditDraftDirty: () => false,
    });
    renderProbe();

    expect(getBlockingAuthorInsightsLogins(window.getAuthorInsightsDraftsSnapshot())).toEqual([]);

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'unsaved draft' });
    });

    expect(getBlockingAuthorInsightsLogins(window.getAuthorInsightsDraftsSnapshot())).toEqual(['octocat']);
  });

  test('given a dirty composer draft, when read via Context getDraftsSnapshot, then it matches the window bridge', () => {
    renderProbe();

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'unsaved draft' });
    });

    expect(probeValue.getDraftsSnapshot()).toEqual(window.getAuthorInsightsDraftsSnapshot());
  });

  test('given the provider unmounts entirely, when checked, then every published bridge is removed', () => {
    const { unmount } = renderProbe();

    expect(typeof window.getAuthorInsightsComposerDraft).toBe('function');
    expect(typeof window.getAuthorInsightsDraftsSnapshot).toBe('function');

    unmount();

    expect(window.getAuthorInsightsComposerDraft).toBeUndefined();
    expect(window.getAuthorInsightsDraftsSnapshot).toBeUndefined();
  });

  test('given no updates at all, when window.getAuthorInsightsManualCommentsLoadState is read, then it defaults to not-loading with no error', () => {
    renderProbe();

    expect(window.getAuthorInsightsManualCommentsLoadState('octocat')).toEqual({
      loading: false,
      error: '',
    });
  });
});
