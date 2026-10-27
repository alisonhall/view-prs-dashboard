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
 * this component's own lifetime needs (AutoRenderBlockingSync.jsx reads it
 * to decide whether a poll must wait - window-bridge elimination Phase 7.4;
 * index.page.js read it through window.* bridges before), so no local
 * mirroring or explicit recompute calls are needed here - every Context
 * write bumps the drafts version that sync component recomputes on.
 * Genuinely component-local UI state (composerSaving/composerStatus/
 * loadState/comments/editingCommentId) stays as local useState.
 *
 * Phase H.15 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2): handleSaveComment/EditForm's handleSave call
 * drafts.saveManualComment/updateManualComment (AuthorInsightsDraftsProvider.tsx)
 * directly now, not window.saveAuthorManualComment/updateAuthorManualComment
 * (deleted outright) - same underlying fetch calls, just reached via the
 * Context this component already consumes for draft state, instead of a
 * window.* round-trip back into index.page.js.
 *
 * @module components/AuthorInsightsCommentsSection
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * `selectedAuthor` is now derived from PrDataContext's `selectedAuthorLogin`
 * (kept in sync by AuthorInsightsSelector.tsx, Phase H.17 - see
 * REACT_MIGRATION_PLAN.md, "Remaining-effort audit", cluster 2; previously
 * pr-author-insights.component.js's renderAuthorInsights, deleted outright
 * that phase) instead of being pushed as a prop via
 * window.updateAuthorInsightsComments (deleted) - the rows/actorsMap that
 * bridge used to also push were already unused here.
 */

import { useEffect, useRef, useState } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { useAuthorInsightsDrafts } from '../state/AuthorInsightsDraftsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import type {
  AuthorManualComment,
  ManualCommentComposerDraft,
  ManualCommentEditDraft,
} from '../helpers/pr-author-insights-data.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

interface SentimentSelectProps {
  value: string | undefined;
  onChange: (sentiment: string) => void;
  disabled?: boolean;
}

function SentimentSelect({ value, onChange, disabled }: SentimentSelectProps) {
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

interface EditFormProps {
  login: string;
  comment: AuthorManualComment;
  // The author's comments after a save, or null when cancelled.
  onDone: (updatedComments: AuthorManualComment[] | null) => void;
}

function EditForm({ login, comment, onDone }: EditFormProps) {
  const { DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } = useAuthorInsights();
  const drafts = useAuthorInsightsDrafts();
  const initialDraft = drafts.getEditDraft(login, comment) || { note: comment?.note || '', sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT };
  const [draft, setDraft] = useState<ManualCommentEditDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const commentId = String(comment?.id || '');

  const updateDraft = (patch: ManualCommentEditDraft) => {
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
      const { response, result } = await drafts.updateManualComment({
        authorLogin: login,
        id: commentId,
        note: draft.note ?? '',
        sentiment: draft.sentiment ?? DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
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

interface ManualCommentItemProps {
  login: string;
  comment: AuthorManualComment;
  editingCommentId: string | null;
  setEditingCommentId: (commentId: string | null) => void;
  onEditSaved: (updatedComments: AuthorManualComment[]) => void;
}

function ManualCommentItem({ login, comment, editingCommentId, setEditingCommentId, onEditSaved }: ManualCommentItemProps) {
  const { getAuthorInsightsSentimentLabel, getAuthorInsightsSentimentBadgeClassName } = useAuthorInsights();
  const commentId = String(comment?.id || '');
  const isEditing = editingCommentId === commentId;

  return (
    <div className="author-insights-item" role="listitem">
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

  const [composerDraft, setComposerDraft] = useState<ManualCommentComposerDraft>({
    note: '',
    sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  });
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerStatus, setComposerStatus] = useState('');
  const [comments, setComments] = useState<AuthorManualComment[]>([]);
  const [loadState, setLoadState] = useState({ loading: false, error: '' });
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const savedStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const updateComposerDraft = (patch: ManualCommentComposerDraft) => {
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
      const { response, result } = await drafts.saveManualComment({
        authorLogin: login,
        note,
        sentiment: composerDraft.sentiment ?? DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
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
      {/* A list only while it holds comments - the loading/error/empty
          messages below are plain paragraphs, not list items. */}
      <div
        className="author-insights-list"
        role={!loadState.loading && !loadState.error && comments.length > 0 ? 'list' : undefined}
      >
        {loadState.loading ? (
          <p className="stats-empty">Loading author comments...</p>
        ) : loadState.error ? (
          <p className="stats-empty">{loadState.error}</p>
        ) : comments.length === 0 ? (
          <p className="stats-empty">No manual comments saved for this author.</p>
        ) : (
          comments.map((comment) => (
            <ManualCommentItem
              key={comment?.id || String(comment?.createdAt ?? '')}
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
