/** @jest-environment jsdom */

const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsCommentsSection } = require('./AuthorInsightsCommentsSection');
const { AuthorInsightsProvider } = require('./AuthorInsightsProvider');
const { AuthorInsightsDraftsProvider } = require('./AuthorInsightsDraftsProvider');
const { PrDataProvider } = require('../state/PrDataProvider');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');

const SENTIMENT_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral', label: 'Neutral' },
];

const authorInsightsOverrides = {
  AUTHOR_COMMENT_SENTIMENT_OPTIONS: SENTIMENT_OPTIONS,
  DEFAULT_AUTHOR_INSIGHTS_SENTIMENT: 'neutral',
  getAuthorInsightsSentimentLabel: (value) => (value === 'positive' ? 'Positive' : value === 'negative' ? 'Negative' : 'Neutral'),
  getAuthorInsightsSentimentBadgeClassName: () => 'author-insights-badge-sentiment',
  sortAuthorInsightsManualCommentsDesc: (comments) => comments,
};

// Phase 7 (see REACT_MIGRATION_PLAN.md): mounts the real
// AuthorInsightsDraftsProvider now instead of hand-rolled window.*
// stubs - the component reads/writes that Context directly, so exercising
// it through the real Provider (same as this session's ExportTab.test.jsx
// rewrite) proves the actual wiring works, not a mocked stand-in.
const renderSection = (selectedAuthorLogin) =>
  render(
    <PrDataProvider initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorInsightsDraftsProvider>
        <AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, ...authorInsightsOverrides }}>
          <AuthorInsightsCommentsSection />
        </AuthorInsightsContext.Provider>
      </AuthorInsightsDraftsProvider>
    </PrDataProvider>,
  );

describe('AuthorInsightsCommentsSection', () => {
  // loadManualComments (AuthorInsightsDraftsProvider) calls the real
  // pr-author-insights-data.helpers.js loadAuthorManualComments now, which
  // fetches /view-prs/author-comments for real - the old test's blanket
  // window.loadAuthorManualComments stub made that call a no-op; this
  // default (an empty, successful load) reproduces the same baseline for
  // every test that doesn't need its own fetch behavior.
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, comments: [] }) });
  });

  afterEach(() => {
    delete global.fetch;
    delete window.recomputeDirtyPrSectionsFields;
  });

  test('given no selected author, when rendering, then nothing renders', () => {
    const { container } = renderSection('');
    expect(container).toBeEmptyDOMElement();
  });

  test('given a selected author with no saved comments, when rendering, then the empty message shows', async () => {
    renderSection('octocat');
    await waitFor(() => expect(screen.getByText('No manual comments saved for this author.')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('Add a manual comment about this author...')).toBeInTheDocument();
  });

  test('given an author whose manual-comments fetch is still pending, when rendering, then the loading message shows', () => {
    // loadManualComments (AuthorInsightsDraftsProvider -> pr-author-insights-
    // data.helpers.js's loadAuthorManualComments) fetches /view-prs/author-
    // comments - never resolving it here keeps the real "loading" state
    // active, instead of mocking window.getAuthorInsightsManualCommentsLoadState
    // directly (that bridge no longer exists as an overridable stub on its
    // own - it's real Context-backed state now).
    global.fetch = jest.fn(() => new Promise(() => {}));
    renderSection('octocat');
    expect(screen.getByText('Loading author comments...')).toBeInTheDocument();
    delete global.fetch;
  });

  test('given an author whose manual-comments fetch fails, when rendering, then the error message shows', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Failed to load author comments' }) });
    renderSection('octocat');
    await waitFor(() => expect(screen.getByText('Failed to load author comments')).toBeInTheDocument());
    delete global.fetch;
  });

  test('given text typed into the composer, when typing, then the draft Context is updated and dirty-tracking recomputed', async () => {
    window.recomputeDirtyPrSectionsFields = jest.fn();
    const user = userEvent.setup();
    renderSection('octocat');

    const textarea = screen.getByPlaceholderText('Add a manual comment about this author...');
    await user.type(textarea, 'Hi');

    expect(window.getAuthorInsightsComposerDraft('octocat').note).toBe('Hi');
    expect(window.recomputeDirtyPrSectionsFields).toHaveBeenCalled();
  });

  test('given an empty composer note, when Save comment is clicked, then a validation message shows and nothing is saved', async () => {
    const user = userEvent.setup();
    renderSection('octocat');

    await user.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(screen.getByText('Comment note is required')).toBeInTheDocument();
  });

  // Phase H.15 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): window.saveAuthorManualComment/updateAuthorManualComment
  // are deleted outright - drafts.saveManualComment/updateManualComment
  // (AuthorInsightsDraftsProvider.jsx) call the real postJson/fetchFn
  // helpers now, so these tests mock global.fetch by HTTP method instead
  // of stubbing a window.* bridge.
  test('given a valid composer note, when Save comment succeeds, then the comment list updates and "Saved." shows', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((_url, init = {}) => {
      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, comments: [{ id: 'c1', note: 'Nice work', sentiment: 'positive', createdAt: '2026-07-01T00:00:00Z' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, comments: [] }) });
    });

    renderSection('octocat');
    await user.type(screen.getByPlaceholderText('Add a manual comment about this author...'), 'Nice work');
    await user.click(screen.getByRole('button', { name: 'Save comment' }));

    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/author-comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ authorLogin: 'octocat', note: 'Nice work', sentiment: 'neutral' }),
      }),
    );
    expect(screen.getByText('Nice work')).toBeInTheDocument();
    expect(window.getAuthorManualCommentsForLogin('octocat')).toHaveLength(1);
  });

  test('given a save failure, when Save comment is clicked, then the error message shows', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((_url, init = {}) => {
      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: false, error: 'Save failed' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, comments: [] }) });
    });

    renderSection('octocat');
    await user.type(screen.getByPlaceholderText('Add a manual comment about this author...'), 'Nice work');
    await user.click(screen.getByRole('button', { name: 'Save comment' }));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument());
  });

  test('given a saved comment, when Edit then Cancel is clicked, then no network call happens and the read-only view is restored', async () => {
    const user = userEvent.setup();
    // Seeding via the real initial fetch (not a post-mount window.*
    // bridge call) - AuthorInsightsCommentsSection only re-reads the
    // drafts Context's manual-comments cache at specific trigger points
    // (its own mount effect, a save/edit success), not on every Context
    // write, so a bridge call after mount with this author already
    // selected would never be observed; this mirrors how the real app
    // actually gets comments onto the screen.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, comments: [{ id: 'c1', note: 'Original text', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }] }),
    });

    render(
      <PrDataProvider initialSelectedAuthorLogin="octocat">
        <AuthorInsightsDraftsProvider>
          <AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, ...authorInsightsOverrides }}>
            <AuthorInsightsCommentsSection />
          </AuthorInsightsContext.Provider>
        </AuthorInsightsDraftsProvider>
      </PrDataProvider>,
    );
    await waitFor(() => expect(screen.getByText('Original text')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    global.fetch.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Original text')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given a saved comment, when edited and Save changes succeeds, then the comment list updates via the PUT call', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((_url, init = {}) => {
      if (String(init?.method || 'GET').toUpperCase() === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, comments: [{ id: 'c1', note: 'Updated text', sentiment: 'positive', createdAt: '2026-07-01T00:00:00Z' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, comments: [{ id: 'c1', note: 'Original text', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }] }),
      });
    });

    render(
      <PrDataProvider initialSelectedAuthorLogin="octocat">
        <AuthorInsightsDraftsProvider>
          <AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, ...authorInsightsOverrides }}>
            <AuthorInsightsCommentsSection />
          </AuthorInsightsContext.Provider>
        </AuthorInsightsDraftsProvider>
      </PrDataProvider>,
    );
    await waitFor(() => expect(screen.getByText('Original text')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const editTextarea = screen.getByDisplayValue('Original text');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Updated text');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Updated text')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/author-comments',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ authorLogin: 'octocat', id: 'c1', note: 'Updated text', sentiment: 'neutral' }),
      }),
    );
    expect(window.getAuthorManualCommentsForLogin('octocat')[0].note).toBe('Updated text');
  });

  test('given a comment is being edited, when an unrelated payload update lands, then the edit form stays open (regression: AuthorInsightsProvider must not hand out a new sortAuthorInsightsManualCommentsDesc reference just because payload changed)', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, comments: [{ id: 'c1', note: 'Original text', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }] }),
    });

    // Uses the real AuthorInsightsProvider (not the static override above)
    // since the bug only manifests when the Context value's functions are
    // rebuilt on a payload change - a static mock value can't reproduce it.
    render(
      <PrDataProvider initialSelectedAuthorLogin="octocat" initialPayload={{ byPrNumber: {} }}>
        <AuthorInsightsDraftsProvider>
          <AuthorInsightsProvider>
            <AuthorInsightsCommentsSection />
          </AuthorInsightsProvider>
        </AuthorInsightsDraftsProvider>
      </PrDataProvider>,
    );
    await waitFor(() => expect(screen.getByText('Original text')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    act(() => {
      window.updateReactPrTable({ byPrNumber: { 1: {} } });
    });

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  test('given a change to the selected author in Context, when it updates, then the composer/list reflect the new author', async () => {
    global.fetch = jest.fn((url) => {
      const authorLogin = new URL(String(url), 'http://localhost').searchParams.get('authorLogin');
      const commentsByLogin = {
        octocat: [{ id: 'c1', note: 'For octocat', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }],
        other: [{ id: 'c2', note: 'For other', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }],
      };
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, comments: commentsByLogin[authorLogin] || [] }) });
    });

    renderSection('octocat');
    await waitFor(() => expect(screen.getByText('For octocat')).toBeInTheDocument());

    act(() => {
      window.updateReactSelectedAuthorLogin('other');
    });
    await waitFor(() => expect(screen.getByText('For other')).toBeInTheDocument());
    expect(screen.queryByText('For octocat')).not.toBeInTheDocument();
  });
});
