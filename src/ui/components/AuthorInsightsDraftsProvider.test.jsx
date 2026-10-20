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
    delete window.getAuthorManualCommentsForLogin;
    delete window.getAuthorInsightsDraftsSnapshot;
    delete window.recomputeDirtyPrSectionsFields;
    probeValue = undefined;
    cleanup();
  });

  // Eleventh follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit"): getComposerDraft/updateComposerDraft/getEditDraftMap/
  // updateEditDraft/setManualComments/getManualComments no longer have a
  // window.* bridge at all - AuthorInsightsCommentsSection.jsx (their only
  // real consumer) already called every one of them via
  // useAuthorInsightsDrafts() directly, so these round-trip entirely
  // through the Context value now.
  test('given a composer draft update via Context, when read back via Context, then it reflects the same value', () => {
    renderProbe();

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'hello', sentiment: 'positive' });
    });

    expect(probeValue.getComposerDraft('octocat')).toEqual({
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

  test('given an edit draft update via Context, when read back via Context, then it reflects the same value', () => {
    renderProbe();

    act(() => {
      probeValue.updateEditDraft('octocat', 'c1', { note: 'edited', sentiment: 'negative', isEditing: true });
    });

    expect(probeValue.getEditDraftMap('octocat')).toEqual({
      c1: { note: 'edited', sentiment: 'negative', isEditing: true },
    });
  });

  test('given manual comments set via Context, when read back via Context, then they round-trip', () => {
    renderProbe();

    act(() => {
      probeValue.setManualComments('octocat', [{ id: 'c1', note: 'x' }]);
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

    expect(typeof window.getAuthorManualCommentsForLogin).toBe('function');
    expect(typeof window.getAuthorInsightsDraftsSnapshot).toBe('function');

    unmount();

    expect(window.getAuthorManualCommentsForLogin).toBeUndefined();
    expect(window.getAuthorInsightsDraftsSnapshot).toBeUndefined();
  });

  test('given no updates at all, when Context getManualCommentsLoadState is read, then it defaults to not-loading with no error', () => {
    renderProbe();

    expect(probeValue.getManualCommentsLoadState('octocat')).toEqual({
      loading: false,
      error: '',
    });
  });
});
