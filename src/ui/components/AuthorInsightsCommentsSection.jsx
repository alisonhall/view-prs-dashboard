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
 * Important: composer/edit draft state is NOT local-only React state. The
 * auto-render-blocking feature (pr-auto-render-blocking.helpers.js's
 * getBlockingAuthorInsightsLogins, wired into
 * recomputeDirtyPrSectionsFields/getAutoRenderBlockingState in
 * index.page.js) reads authorInsightsState.manualCommentDraftByAuthorLogin
 * / manualCommentEditDraftByAuthorLogin directly to decide whether an
 * incoming poll should be blocked because the user has unsaved author
 * comment edits, and getAuthorManualCommentsForLogin (also reading
 * authorInsightsState.manualCommentsByAuthorLogin) to tell a genuinely
 * dirty edit apart from a no-op one. So every draft mutation here goes
 * through the existing window bridges (getAuthorInsightsComposerDraft/
 * updateAuthorInsightsComposerDraft/etc.) to keep that shared vanilla
 * state correct - local useState here exists only to trigger re-renders,
 * not as the source of truth. This is the same "vanilla remains source of
 * truth, React re-renders on top" shape as every other Phase 1-3 bridge,
 * just now presented as controlled JSX inputs instead of raw DOM.
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

const DEFAULT_SENTIMENT = () => window.DEFAULT_AUTHOR_INSIGHTS_SENTIMENT || 'neutral';
const SENTIMENT_OPTIONS = () =>
  window.AUTHOR_COMMENT_SENTIMENT_OPTIONS || [
    { value: 'positive', label: 'Positive' },
    { value: 'negative', label: 'Negative' },
    { value: 'neutral', label: 'Neutral' },
  ];

const formatIsoDatetime = (value) => (window.formatIsoDatetime ? window.formatIsoDatetime(value) : String(value || '-'));
const getSentimentLabel = (value) => (window.getAuthorInsightsSentimentLabel ? window.getAuthorInsightsSentimentLabel(value) : 'Neutral');
const getSentimentBadgeClassName = (value) =>
  window.getAuthorInsightsSentimentBadgeClassName ? window.getAuthorInsightsSentimentBadgeClassName(value) : '';
const sortManualCommentsDesc = (comments) =>
  window.sortAuthorInsightsManualCommentsDesc ? window.sortAuthorInsightsManualCommentsDesc(comments) : comments;
const resolveActorDisplayName = (login, actorsMap, fallback) =>
  window.resolveActorDisplayName ? window.resolveActorDisplayName(login, actorsMap, fallback) : String(fallback || login || '').trim();
const recomputeDirty = () => window.recomputeDirtyPrSectionsFields?.();

function SentimentSelect({ value, onChange, disabled }) {
  return (
    <select className="author-insights-comment-sentiment" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {SENTIMENT_OPTIONS().map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function EditForm({ login, comment, onDone }) {
  const initialDraft = window.getAuthorInsightsEditDraft?.(login, comment) || { note: comment?.note || '', sentiment: DEFAULT_SENTIMENT() };
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const commentId = String(comment?.id || '');

  const updateDraft = (patch) => {
    const next = { ...draft, ...patch, isEditing: true };
    setDraft(next);
    window.updateAuthorInsightsEditDraft?.(login, commentId, next);
    recomputeDirty();
  };

  const handleCancel = () => {
    window.resetAuthorInsightsEditDraft?.(login, commentId);
    recomputeDirty();
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
      window.resetAuthorInsightsEditDraft?.(login, commentId);
      window.setAuthorInsightsManualComments?.(login, result.comments);
      recomputeDirty();
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
  const commentId = String(comment?.id || '');
  const isEditing = editingCommentId === commentId;

  return (
    <div className="author-insights-item">
      <div className="author-insights-meta">
        <span className={`author-insights-badge ${getSentimentBadgeClassName(comment?.sentiment)}`.trim()}>
          {`Sentiment: ${getSentimentLabel(comment?.sentiment)}`}
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
  const actorsMap = payload?.actorsMap || {};
  const selectedAuthor = selectedAuthorLogin
    ? { login: selectedAuthorLogin, name: resolveActorDisplayName(selectedAuthorLogin, actorsMap, selectedAuthorLogin) }
    : null;
  const login = selectedAuthor?.login || '';

  const [composerDraft, setComposerDraft] = useState({ note: '', sentiment: DEFAULT_SENTIMENT() });
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

    setComposerDraft(window.getAuthorInsightsComposerDraft?.(login) || { note: '', sentiment: DEFAULT_SENTIMENT() });
    setComposerStatus('');
    setEditingCommentId(null);

    const refreshComments = () => {
      setComments(sortManualCommentsDesc(window.getAuthorManualCommentsForLogin?.(login) || []));
      setLoadState(window.getAuthorInsightsManualCommentsLoadState?.(login) || { loading: false, error: '' });
    };

    window.loadAuthorManualComments?.(login, refreshComments);
    refreshComments();

    return () => {
      if (savedStatusTimeoutRef.current) {
        clearTimeout(savedStatusTimeoutRef.current);
      }
    };
  }, [login]);

  if (!selectedAuthor) {
    return null;
  }

  const updateComposerDraft = (patch) => {
    const next = { ...composerDraft, ...patch };
    setComposerDraft(next);
    window.updateAuthorInsightsComposerDraft?.(login, next);
    recomputeDirty();
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

      window.setAuthorInsightsManualComments?.(login, result.comments);
      window.resetAuthorInsightsComposerDraft?.(login);
      setComposerDraft({ note: '', sentiment: DEFAULT_SENTIMENT() });
      setComments(sortManualCommentsDesc(Array.isArray(result.comments) ? result.comments : []));
      setComposerStatus('Saved.');
      recomputeDirty();
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
              onEditSaved={(updatedComments) => setComments(sortManualCommentsDesc(updatedComments))}
            />
          ))
        )}
      </div>
    </section>
  );
}
