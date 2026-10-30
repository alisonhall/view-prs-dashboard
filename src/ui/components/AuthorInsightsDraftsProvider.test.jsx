/** @jest-environment jsdom */

const { render, cleanup, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsDraftsProvider } = require('./AuthorInsightsDraftsProvider');
const { useAuthorInsightsDrafts, useAuthorInsightsDraftsVersion } = require('../state/AuthorInsightsDraftsContext');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrAutoRenderBlockingHelpers } = require('../helpers/pr-auto-render-blocking.helpers.ts');

// Phase 7 (see REACT_MIGRATION_PLAN.md): closes a real coverage gap for
// the same class of bug flagged in NotesDirtyProvider.test.jsx's own
// comment (the getBlockingAuthorInsightsLogins bare-shorthand-property
// bug) - no existing test exercises the real wiring between a real
// AuthorInsightsDraftsProvider instance and the window.* bridge
// pr-auto-render-blocking.helpers.ts actually reads.
let probeValue;
let probeVersion;
let probeRenders = 0;
function Probe() {
  probeValue = useAuthorInsightsDrafts();
  probeRenders += 1;
  return null;
}
// Window-bridge elimination Phase 7.4: AutoRenderBlockingSync reads the
// version Context to recompute on every draft change.
function VersionProbe() {
  probeVersion = useAuthorInsightsDraftsVersion();
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
        <VersionProbe />
      </AuthorInsightsDraftsProvider>
    </PrDataProvider>,
  );

describe('AuthorInsightsDraftsProvider', () => {
  afterEach(() => {
    probeValue = undefined;
    probeVersion = undefined;
    probeRenders = 0;
    cleanup();
  });

  // Eleventh follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
  // audit"): getComposerDraft/updateComposerDraft/getEditDraftMap/
  // updateEditDraft/setManualComments/getManualComments no longer have a
  // window.* bridge at all - AuthorInsightsCommentsSection.tsx (their only
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

  // Phase 7.4: replaces "window.recomputeDirtyPrSectionsFields is called".
  test('given a composer draft update, when written, then the version Context bumps while the drafts Context value (and its consumers) stay put', () => {
    renderProbe();
    const firstValue = probeValue;
    const firstVersion = probeVersion;
    const rendersBefore = probeRenders;

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'hello' });
    });

    expect(probeVersion).toBeGreaterThan(firstVersion);
    expect(probeValue).toBe(firstValue);
    expect(probeRenders).toBe(rendersBefore);
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

  // Test-only bridge removal: read through Context getDraftsSnapshot (what
  // AutoRenderBlockingSync uses); it was window.getAuthorInsightsDraftsSnapshot.
  test('given a dirty composer draft, when Context getDraftsSnapshot feeds the real getBlockingAuthorInsightsLogins, then that author is reported as blocking', () => {
    const { getBlockingAuthorInsightsLogins } = createPrAutoRenderBlockingHelpers({
      isAuthorInsightsComposerDraftDirty: (draft) => Boolean(String(draft?.note || '').trim()),
      getAuthorManualCommentsForLogin: () => [],
      isAuthorInsightsEditDraftDirty: () => false,
    });
    renderProbe();

    expect(getBlockingAuthorInsightsLogins(probeValue.getDraftsSnapshot())).toEqual([]);

    act(() => {
      probeValue.updateComposerDraft('octocat', { note: 'unsaved draft' });
    });

    expect(getBlockingAuthorInsightsLogins(probeValue.getDraftsSnapshot())).toEqual(['octocat']);
  });

  test('given the provider mounts, when window is checked, then it publishes no bridges', () => {
    renderProbe();

    expect(window.getAuthorInsightsDraftsSnapshot).toBeUndefined();
    expect(window.getAuthorManualCommentsForLogin).toBeUndefined();
  });

  test('given no updates at all, when Context getManualCommentsLoadState is read, then it defaults to not-loading with no error', () => {
    renderProbe();

    expect(probeValue.getManualCommentsLoadState('octocat')).toEqual({
      loading: false,
      error: '',
    });
  });
});
