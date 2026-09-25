/** @jest-environment jsdom */

const { render, screen, waitFor, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsCommentsSection } = require('./AuthorInsightsCommentsSection');
const { PrDataProvider } = require('../state/PrDataProvider');

const SENTIMENT_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral', label: 'Neutral' },
];

const renderSection = (selectedAuthorLogin) =>
  render(
    <PrDataProvider initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorInsightsCommentsSection />
    </PrDataProvider>,
  );

describe('AuthorInsightsCommentsSection', () => {
  let composerDrafts;
  let editDrafts;
  let commentsByLogin;

  beforeEach(() => {
    composerDrafts = {};
    editDrafts = {};
    commentsByLogin = {};

    window.AUTHOR_COMMENT_SENTIMENT_OPTIONS = SENTIMENT_OPTIONS;
    window.DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = 'neutral';
    window.formatIsoDatetime = (value) => String(value || '-');
    window.getAuthorInsightsSentimentLabel = (value) => (value === 'positive' ? 'Positive' : value === 'negative' ? 'Negative' : 'Neutral');
    window.getAuthorInsightsSentimentBadgeClassName = () => 'author-insights-badge-sentiment';
    window.sortAuthorInsightsManualCommentsDesc = (comments) => comments;
    window.recomputeDirtyPrSectionsFields = jest.fn();

    window.getAuthorInsightsComposerDraft = (login) => composerDrafts[login] || { note: '', sentiment: 'neutral' };
    window.updateAuthorInsightsComposerDraft = (login, draft) => {
      composerDrafts[login] = { ...composerDrafts[login], ...draft };
      return composerDrafts[login];
    };
    window.resetAuthorInsightsComposerDraft = (login) => {
      composerDrafts[login] = { note: '', sentiment: 'neutral' };
    };

    window.getAuthorInsightsEditDraft = (login, comment) =>
      (editDrafts[login] || {})[comment?.id] || { note: comment?.note || '', sentiment: comment?.sentiment || 'neutral', isEditing: false };
    window.updateAuthorInsightsEditDraft = (login, id, draft) => {
      editDrafts[login] = editDrafts[login] || {};
      editDrafts[login][id] = { ...editDrafts[login][id], ...draft };
      return editDrafts[login][id];
    };
    window.resetAuthorInsightsEditDraft = (login, id) => {
      if (editDrafts[login]) delete editDrafts[login][id];
    };

    window.getAuthorManualCommentsForLogin = (login) => commentsByLogin[login] || [];
    window.setAuthorInsightsManualComments = (login, comments) => {
      commentsByLogin[login] = Array.isArray(comments) ? comments : [];
    };
    window.getAuthorInsightsManualCommentsLoadState = () => ({ loading: false, error: '' });
    window.loadAuthorManualComments = (_login, onComplete) => onComplete();
  });

  afterEach(() => {
    delete window.AUTHOR_COMMENT_SENTIMENT_OPTIONS;
    delete window.DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;
    delete window.formatIsoDatetime;
    delete window.getAuthorInsightsSentimentLabel;
    delete window.getAuthorInsightsSentimentBadgeClassName;
    delete window.sortAuthorInsightsManualCommentsDesc;
    delete window.recomputeDirtyPrSectionsFields;
    delete window.getAuthorInsightsComposerDraft;
    delete window.updateAuthorInsightsComposerDraft;
    delete window.resetAuthorInsightsComposerDraft;
    delete window.getAuthorInsightsEditDraft;
    delete window.updateAuthorInsightsEditDraft;
    delete window.resetAuthorInsightsEditDraft;
    delete window.getAuthorManualCommentsForLogin;
    delete window.setAuthorInsightsManualComments;
    delete window.getAuthorInsightsManualCommentsLoadState;
    delete window.loadAuthorManualComments;
    delete window.saveAuthorManualComment;
    delete window.updateAuthorManualComment;
    delete window.resolveActorDisplayName;
  });

  test('given no selected author, when rendering, then nothing renders', () => {
    const { container } = renderSection('');
    expect(container).toBeEmptyDOMElement();
  });

  test('given a selected author with no saved comments, when rendering, then the empty message shows', () => {
    renderSection('octocat');
    expect(screen.getByText('No manual comments saved for this author.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a manual comment about this author...')).toBeInTheDocument();
  });

  test('given loading state, when rendering, then the loading message shows', () => {
    window.getAuthorInsightsManualCommentsLoadState = () => ({ loading: true, error: '' });
    renderSection('octocat');
    expect(screen.getByText('Loading author comments...')).toBeInTheDocument();
  });

  test('given an error state, when rendering, then the error message shows', () => {
    window.getAuthorInsightsManualCommentsLoadState = () => ({ loading: false, error: 'Failed to load author comments' });
    renderSection('octocat');
    expect(screen.getByText('Failed to load author comments')).toBeInTheDocument();
  });

  test('given text typed into the composer, when typing, then the draft bridge is updated and dirty-tracking recomputed', async () => {
    const user = userEvent.setup();
    renderSection('octocat');

    const textarea = screen.getByPlaceholderText('Add a manual comment about this author...');
    await user.type(textarea, 'Hi');

    expect(composerDrafts.octocat.note).toBe('Hi');
    expect(window.recomputeDirtyPrSectionsFields).toHaveBeenCalled();
  });

  test('given an empty composer note, when Save comment is clicked, then a validation message shows and nothing is saved', async () => {
    const user = userEvent.setup();
    renderSection('octocat');

    await user.click(screen.getByRole('button', { name: 'Save comment' }));
    expect(screen.getByText('Comment note is required')).toBeInTheDocument();
  });

  test('given a valid composer note, when Save comment succeeds, then the comment list updates and "Saved." shows', async () => {
    const user = userEvent.setup();
    window.saveAuthorManualComment = jest.fn().mockResolvedValue({
      response: { ok: true },
      result: { ok: true, comments: [{ id: 'c1', note: 'Nice work', sentiment: 'positive', createdAt: '2026-07-01T00:00:00Z' }] },
    });

    renderSection('octocat');
    await user.type(screen.getByPlaceholderText('Add a manual comment about this author...'), 'Nice work');
    await user.click(screen.getByRole('button', { name: 'Save comment' }));

    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    expect(window.saveAuthorManualComment).toHaveBeenCalledWith({ authorLogin: 'octocat', note: 'Nice work', sentiment: 'neutral' });
    expect(screen.getByText('Nice work')).toBeInTheDocument();
    expect(commentsByLogin.octocat).toHaveLength(1);
  });

  test('given a save failure, when Save comment is clicked, then the error message shows', async () => {
    const user = userEvent.setup();
    window.saveAuthorManualComment = jest.fn().mockResolvedValue({ response: { ok: true }, result: { ok: false, error: 'Save failed' } });

    renderSection('octocat');
    await user.type(screen.getByPlaceholderText('Add a manual comment about this author...'), 'Nice work');
    await user.click(screen.getByRole('button', { name: 'Save comment' }));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument());
  });

  test('given a saved comment, when Edit then Cancel is clicked, then no network call happens and the read-only view is restored', async () => {
    const user = userEvent.setup();
    commentsByLogin.octocat = [{ id: 'c1', note: 'Original text', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }];
    window.updateAuthorManualComment = jest.fn();

    renderSection('octocat');
    expect(screen.getByText('Original text')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Original text')).toBeInTheDocument();
    expect(window.updateAuthorManualComment).not.toHaveBeenCalled();
  });

  test('given a saved comment, when edited and Save changes succeeds, then the comment list updates via the PUT bridge', async () => {
    const user = userEvent.setup();
    commentsByLogin.octocat = [{ id: 'c1', note: 'Original text', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }];
    window.updateAuthorManualComment = jest.fn().mockResolvedValue({
      response: { ok: true },
      result: { ok: true, comments: [{ id: 'c1', note: 'Updated text', sentiment: 'positive', createdAt: '2026-07-01T00:00:00Z' }] },
    });

    renderSection('octocat');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const editTextarea = screen.getByDisplayValue('Original text');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Updated text');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Updated text')).toBeInTheDocument());
    expect(window.updateAuthorManualComment).toHaveBeenCalledWith({ authorLogin: 'octocat', id: 'c1', note: 'Updated text', sentiment: 'neutral' });
    expect(commentsByLogin.octocat[0].note).toBe('Updated text');
  });

  test('given a change to the selected author in Context, when it updates, then the composer/list reflect the new author', () => {
    commentsByLogin.octocat = [{ id: 'c1', note: 'For octocat', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }];
    commentsByLogin.other = [{ id: 'c2', note: 'For other', sentiment: 'neutral', createdAt: '2026-07-01T00:00:00Z' }];

    renderSection('octocat');
    expect(screen.getByText('For octocat')).toBeInTheDocument();

    act(() => {
      window.updateReactSelectedAuthorLogin('other');
    });
    expect(screen.getByText('For other')).toBeInTheDocument();
    expect(screen.queryByText('For octocat')).not.toBeInTheDocument();
  });
});
