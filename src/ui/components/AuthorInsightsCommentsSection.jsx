/**
 * AuthorInsightsCommentsSection - React-owned "Manual author comments"
 * composer/editor for the Author Insights tab.
 *
 * Track B batch 2 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * real JSX now, replacing the ref+useEffect wrapper around
 * pr-author-insights.component.js's buildManualCommentsSection() (deleted,
 * along with its renderComposerForm/renderManualCommentList/
 * renderManualCommentItem/renderEditForm helpers).
 *
 * Phase 7 (see REACT_MIGRATION_PLAN.md): composer/edit draft state reads
 * and writes AuthorInsightsDraftsContext directly now (useAuthorInsightsDrafts())
 * instead of mirroring into local useState while also calling through
 * window.* bridges - that Context *is* the shared state other code outside
 * this component's own lifetime needs (pr-auto-render-blocking.helpers.js's
 * getBlockingAuthorInsightsLogins/pr-auto-render-navigation.helpers.js's
 * getFirstDirtyAuthorInsightsElement, both still vanilla, read it via the
 * window.* bridges AuthorInsightsDraftsProvider.jsx republishes), so no
 * local mirroring or explicit recomputeDirtyPrSectionsFields() calls are
 * needed here any more - every Context write already triggers that itself.
 * Genuinely component-local UI state (composerSaving/composerStatus/
 * loadState/comments/editingCommentId) stays as local useState.
 *
 * @module components/AuthorInsightsCommentsSection
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * `selectedAuthor` is now derived from PrDataContext's `selectedAuthorLogin`
 * (kept in sync by pr-author-insights.component.js's renderAuthorInsights)
 * instead of being pushed as a prop via window.updateAuthorInsightsComments
 * (deleted) - the rows/actorsMap that bridge used to also push were already
 * unused here.
 */

import { useEffect, useRef, useState } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { useAuthorInsightsDrafts } from '../state/AuthorInsightsDraftsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

function SentimentSelect({ value, onChange, disabled }) {
  const { AUTHOR_COMMENT_SENTIMENT_OPTIONS } = useAuthorInsights();
  return (
    <select className="author-insights-comment-sentiment" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {AUTHOR_COMMENT_SENTIMENT_OPTIONS.map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function EditForm({ login, comment, onDone }) {
  const { DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } = useAuthorInsights();
  const drafts = useAuthorInsightsDrafts();
  const initialDraft = drafts.getEditDraft(login, comment) || { note: comment?.note || '', sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT };
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const commentId = String(comment?.id || '');

  const updateDraft = (patch) => {
    const next = { ...draft, ...patch, isEditing: true };
    setDraft(next);
    drafts.updateEditDraft(login, commentId, next);
  };

  const handleCancel = () => {
    drafts.resetEditDraft(login, commentId);
    onDone(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('Saving...');
    try {
      const { response, result } = await window.updateAuthorManualComment({
        authorLogin: login,
        id: commentId,
        note: draft.note,
        sentiment: draft.sentiment,
      });
      if (!response.ok || result.ok === false) {
        setStatus(result.error || 'Failed to save comment edits');
        return;
      }
      drafts.resetEditDraft(login, commentId);
      drafts.setManualComments(login, result.comments);
      onDone(Array.isArray(result.comments) ? result.comments : []);
    } catch (_error) {
      setStatus('Failed to save comment edits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="author-insights-comment-form" data-author-login={login} data-comment-id={commentId}>
      <textarea
        className="author-insights-comment-textarea"
        rows={3}
        value={draft.note}
        data-author-login={login}
        data-comment-id={commentId}
        onChange={(e) => updateDraft({ note: e.target.value })}
      />
      <div className="author-insights-comment-controls">
        <SentimentSelect value={draft.sentiment} onChange={(sentiment) => updateDraft({ sentiment })} />
        <button type="button" className="author-insights-comment-save" disabled={saving} onClick={handleSave}>
          Save changes
        </button>
        <button type="button" className="author-insights-comment-cancel" onClick={handleCancel}>
          Cancel
        </button>
        <span className="author-insights-comment-status">{status}</span>
      </div>
    </div>
  );
}

function ManualCommentItem({ login, comment, editingCommentId, setEditingCommentId, onEditSaved }) {
  const { getAuthorInsightsSentimentLabel, getAuthorInsightsSentimentBadgeClassName } = useAuthorInsights();
  const commentId = String(comment?.id || '');
  const isEditing = editingCommentId === commentId;

  return (
    <div className="author-insights-item">
      <div className="author-insights-meta">
        <span className={`author-insights-badge ${getAuthorInsightsSentimentBadgeClassName(comment?.sentiment)}`.trim()}>
          {`Sentiment: ${getAuthorInsightsSentimentLabel(comment?.sentiment)}`}
        </span>
        <span className="author-insights-meta-detail">{`Added: ${formatIsoDatetime(comment?.createdAt || '-')}`}</span>
      </div>
      {!isEditing && (
        <>
          <div className="author-insights-body">{String(comment?.note || '').trim() || '(No manual comment text)'}</div>
          <div className="author-insights-comment-actions">
            <button type="button" className="author-insights-comment-edit" onClick={() => setEditingCommentId(commentId)}>
              Edit
            </button>
          </div>
        </>
      )}
      {isEditing && (
        <EditForm
          login={login}
          comment={comment}
          onDone={(updatedComments) => {
            setEditingCommentId(null);
            if (updatedComments) {
              onEditSaved(updatedComments);
            }
          }}
        />
      )}
    </div>
  );
}

export function AuthorInsightsCommentsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { resolveActorDisplayName } = useActorIdentity();
  const { DEFAULT_AUTHOR_INSIGHTS_SENTIMENT, sortAuthorInsightsManualCommentsDesc } = useAuthorInsights();
  const drafts = useAuthorInsightsDrafts();
  const actorsMap = payload?.actorsMap || {};
  const selectedAuthor = selectedAuthorLogin
    ? { login: selectedAuthorLogin, name: resolveActorDisplayName(selectedAuthorLogin, actorsMap, selectedAuthorLogin) }
    : null;
  const login = selectedAuthor?.login || '';

  const [composerDraft, setComposerDraft] = useState({ note: '', sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT });
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerStatus, setComposerStatus] = useState('');
  const [comments, setComments] = useState([]);
  const [loadState, setLoadState] = useState({ loading: false, error: '' });
  const [editingCommentId, setEditingCommentId] = useState(null);
  const savedStatusTimeoutRef = useRef(null);

  useEffect(() => {
    if (!login) {
      return undefined;
    }

    setComposerDraft(drafts.getComposerDraft(login) || { note: '', sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT });
    setComposerStatus('');
    setEditingCommentId(null);

    const refreshComments = () => {
      setComments(sortAuthorInsightsManualCommentsDesc(drafts.getManualComments(login) || []));
      setLoadState(drafts.getManualCommentsLoadState(login) || { loading: false, error: '' });
    };

    drafts.loadManualComments(login, refreshComments);
    refreshComments();

    return () => {
      if (savedStatusTimeoutRef.current) {
        clearTimeout(savedStatusTimeoutRef.current);
      }
    };
  }, [login, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT, sortAuthorInsightsManualCommentsDesc, drafts]);

  if (!selectedAuthor) {
    return null;
  }

  const updateComposerDraft = (patch) => {
    const next = { ...composerDraft, ...patch };
    setComposerDraft(next);
    drafts.updateComposerDraft(login, next);
  };

  const handleSaveComment = async () => {
    const note = String(composerDraft.note || '');
    if (!note.trim()) {
      setComposerStatus('Comment note is required');
      return;
    }

    setComposerSaving(true);
    setComposerStatus('Saving...');
    try {
      const { response, result } = await window.saveAuthorManualComment({
        authorLogin: login,
        note,
        sentiment: composerDraft.sentiment,
      });
      if (!response.ok || result.ok === false) {
        setComposerStatus(result.error || 'Save failed');
        return;
      }

      drafts.setManualComments(login, result.comments);
      drafts.resetComposerDraft(login);
      setComposerDraft({ note: '', sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT });
      setComments(sortAuthorInsightsManualCommentsDesc(Array.isArray(result.comments) ? result.comments : []));
      setComposerStatus('Saved.');
      savedStatusTimeoutRef.current = setTimeout(() => setComposerStatus(''), 2500);
    } catch (_error) {
      setComposerStatus('Save failed');
    } finally {
      setComposerSaving(false);
    }
  };

  return (
    <section className="author-insights-section">
      <h3>Manual author comments</h3>
      <div className="author-insights-comment-form">
        <textarea
          className="author-insights-comment-textarea"
          rows={3}
          placeholder="Add a manual comment about this author..."
          value={composerDraft.note}
          data-author-login={login}
          data-draft-kind="composer"
          onChange={(e) => updateComposerDraft({ note: e.target.value })}
        />
        <div className="author-insights-comment-controls">
          <SentimentSelect value={composerDraft.sentiment} onChange={(sentiment) => updateComposerDraft({ sentiment })} />
          <button type="button" className="author-insights-comment-save" disabled={composerSaving} onClick={handleSaveComment}>
            Save comment
          </button>
          <span className="author-insights-comment-status">{composerStatus}</span>
        </div>
      </div>
      <div className="author-insights-list">
        {loadState.loading ? (
          <p className="stats-empty">Loading author comments...</p>
        ) : loadState.error ? (
          <p className="stats-empty">{loadState.error}</p>
        ) : comments.length === 0 ? (
          <p className="stats-empty">No manual comments saved for this author.</p>
        ) : (
          comments.map((comment) => (
            <ManualCommentItem
              key={comment?.id || comment?.createdAt}
              login={login}
              comment={comment}
              editingCommentId={editingCommentId}
              setEditingCommentId={setEditingCommentId}
              onEditSaved={(updatedComments) => setComments(sortAuthorInsightsManualCommentsDesc(updatedComments))}
            />
          ))
        )}
      </div>
    </section>
  );
}
