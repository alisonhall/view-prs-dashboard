/**
 * ReviewThreadsSection - "Review conversations" insight section: review
 * threads (with resolve state + an author-resolved-own-thread warning),
 * top-level PR comments, and orphaned review summaries, with an
 * All/Unresolved/Resolved filter and a summary-cards toggle.
 *
 * Matches vanilla's createReviewThreadsSection (index.page.js). Filtering
 * and the summary toggle are read-only display state (no server calls) —
 * this is a straight port, not a simplification.
 *
 * @module components/insights/ReviewThreadsSection
 */

import React, { useMemo, useState } from 'react';
import { InsightSection } from './InsightSection';
import { ActorIdentity } from '../ActorIdentity';

function useHelpers() {
  return {
    asArray: window.asArray || ((value) => (Array.isArray(value) ? value : [])),
    getPreferredActorKey: window.getPreferredActorKey || ((login, name) => String(login || name || '').trim()),
    resolveActorDisplayName:
      window.resolveActorDisplayName || ((login, _actorsMap, fallback) => String(fallback || login || '').trim()),
    getAuthorThreadResolutionPolicy:
      window.getAuthorThreadResolutionPolicy || (() => ({ mode: 'allow-all', allowLoginKeys: new Set(), denyLoginKeys: new Set() })),
    parseSortableTime: window.parseSortableTime || ((value) => Date.parse(String(value || '')) || 0),
    formatIsoDatetime: window.formatIsoDatetime || ((value) => String(value || '-')),
    renderMarkdownAsHtml: window.renderMarkdownAsHtml || ((text) => String(text || '')),
    readReviewConversationsUiState:
      window.readReviewConversationsUiState || (() => ({ stateKey: '', conversationFilterMode: 'unresolved', showSummaryCards: true })),
    writeReviewConversationsUiState: window.writeReviewConversationsUiState || (() => {}),
  };
}

function getThreadResolutionInfo(thread, prAuthorLogin, policy, helpers) {
  const { asArray, resolveActorDisplayName, parseSortableTime } = helpers;
  const isResolved = thread?.isResolved === true;
  const resolvedByLogin = String(thread?.resolvedByLogin || '').trim();
  const resolvedByKey = resolvedByLogin.toLowerCase();
  const resolvedByAuthor = isResolved && Boolean(prAuthorLogin) && Boolean(resolvedByKey) && resolvedByKey === prAuthorLogin;

  const getCommenterLoginKey = (comment) => String(comment?.authorLogin || '').trim().toLowerCase();
  void resolveActorDisplayName;

  const sortedComments = asArray(thread?.comments)
    .slice()
    .sort((a, b) => parseSortableTime(a?.createdAt || '') - parseSortableTime(b?.createdAt || ''));
  const starterLoginKeyRaw = sortedComments.length ? getCommenterLoginKey(sortedComments[0]) : '';
  const starterLoginKey = starterLoginKeyRaw && starterLoginKeyRaw !== prAuthorLogin ? starterLoginKeyRaw : '';

  let authorResolvedAllowedByPolicy = true;
  if (resolvedByAuthor) {
    if (policy.mode === 'allow-only') {
      authorResolvedAllowedByPolicy = starterLoginKey ? policy.allowLoginKeys.has(starterLoginKey) : true;
    } else if (policy.mode === 'deny-only') {
      authorResolvedAllowedByPolicy = starterLoginKey ? !policy.denyLoginKeys.has(starterLoginKey) : true;
    }
  }
  const incorrectlyResolvedByAuthor = resolvedByAuthor && !authorResolvedAllowedByPolicy;

  return { resolvedByAuthor, incorrectlyResolvedByAuthor };
}

function buildActorBodyMinuteSignature(actor, occurredAt, body) {
  const normalizedActor = String(actor || '').trim().toLowerCase();
  const normalizedOccurredAt = String(occurredAt || '').trim();
  const normalizedBody = String(body || '').trim();
  if (!normalizedActor || !normalizedOccurredAt || !normalizedBody) return '';
  return `${normalizedActor}|${normalizedOccurredAt.slice(0, 16)}|${normalizedBody}`;
}

function CommentBody({ text, helpers }) {
  const bodyText = String(text || '').trim() || '(no comment body)';
  // eslint-disable-next-line react/no-danger
  return <div className="insight-thread-body" dangerouslySetInnerHTML={{ __html: helpers.renderMarkdownAsHtml(bodyText) }} />;
}

function CommentMeta({ pr, actorsMap, timestamp, login, fallbackName, suffix, helpers, isPending }) {
  return (
    <div className="insight-thread-comment-meta insight-event-header">
      <span>
        {helpers.formatIsoDatetime(timestamp || '-')} |{' '}
        <ActorIdentity row={pr} login={login} actorsMap={actorsMap} fallbackName={fallbackName} />
        {suffix || ''}
      </span>
      {isPending && <span className="insight-comment-state-badge">Pending</span>}
    </div>
  );
}

function ReviewThreadCard({ thread, index, pr, actorsMap, prAuthorLogin, policy, helpers }) {
  const { asArray } = helpers;
  const isResolved = thread?.isResolved === true;
  const resolutionInfo = getThreadResolutionInfo(thread, prAuthorLogin, policy, helpers);
  const threadComments = asArray(thread?.comments);
  const stateLabel = isResolved ? 'Resolved' : 'Open';
  const resolvedByLogin = String(thread?.resolvedByLogin || '').trim();
  const participants = asArray(thread?.participants)
    .map((login) => ({ login }))
    .filter((p) => String(p.login || '').trim());

  const rootComment = threadComments.find((c) => String(c?.path || '').trim());
  const threadFilePath = rootComment ? String(rootComment.path || '').trim() : '';
  const threadFileLine = rootComment != null ? rootComment.line ?? rootComment.originalLine ?? null : null;
  const fileRef = threadFilePath ? (threadFileLine != null ? `${threadFilePath}:${threadFileLine}` : threadFilePath) : '';

  const getThreadViewUrl = () => {
    const explicit = String(thread?.url || thread?.threadUrl || thread?.webUrl || '').trim();
    if (explicit) return explicit;
    const sorted = threadComments.slice().sort((a, b) => helpers.parseSortableTime(a?.createdAt || '') - helpers.parseSortableTime(b?.createdAt || ''));
    const starterUrl = sorted.find((c) => String(c?.url || '').trim())?.url;
    if (starterUrl) return starterUrl;
    return sorted.slice().reverse().find((c) => String(c?.url || '').trim())?.url || '';
  };
  const threadUrl = getThreadViewUrl();

  const cardClassName = [
    'insight-thread',
    isResolved ? 'insight-thread-resolved' : 'insight-thread-open',
    resolutionInfo.resolvedByAuthor ? 'insight-thread-author-resolved' : '',
    resolutionInfo.incorrectlyResolvedByAuthor ? 'insight-thread-author-resolved-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const titleClassName = [
    'insight-thread-title',
    'insight-event-header',
    isResolved ? 'insight-thread-title-resolved' : 'insight-thread-title-open',
    resolutionInfo.resolvedByAuthor ? 'insight-thread-title-author-resolved' : '',
    resolutionInfo.incorrectlyResolvedByAuthor ? 'insight-thread-title-author-resolved-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const segments = [];
  segments.push(`${stateLabel} thread ${index + 1}`);
  segments.push(`${threadComments.length} comments`);
  if (participants.length) {
    segments.push(
      <React.Fragment key="participants">
        Participants:{' '}
        {participants.map((p, i) => (
          <React.Fragment key={p.login}>
            {i > 0 && ', '}
            <ActorIdentity row={pr} login={p.login} actorsMap={actorsMap} />
          </React.Fragment>
        ))}
      </React.Fragment>,
    );
  } else {
    segments.push('unknown participants');
  }
  if (fileRef) segments.push(fileRef);
  if (isResolved && resolvedByLogin) {
    segments.push(
      <React.Fragment key="resolved-by">
        Resolved by: <ActorIdentity row={pr} login={resolvedByLogin} actorsMap={actorsMap} />
      </React.Fragment>,
    );
  }
  if (isResolved && resolutionInfo.resolvedByAuthor) segments.push('Author resolved');
  if (isResolved && resolutionInfo.incorrectlyResolvedByAuthor) segments.push('WARNING: should be resolved by thread starter');

  return (
    <div className={cardClassName}>
      <div className={titleClassName}>
        <span>
          {segments.map((segment, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <React.Fragment key={i}>
              {i > 0 && ' | '}
              {segment}
            </React.Fragment>
          ))}
        </span>
        {threadUrl && (
          <a className="insight-event-link" href={threadUrl} target="_blank" rel="noopener noreferrer">
            View →
          </a>
        )}
      </div>
      <div className="insight-thread-comments">
        {threadComments.map((comment, i) => {
          const isPending = String(comment?.state || '').toUpperCase() === 'PENDING';
          return (
            // eslint-disable-next-line react/no-array-index-key
            <div key={comment?.id || i} className={['insight-thread-comment', isPending ? 'insight-thread-comment-pending' : 'insight-thread-comment-submitted'].join(' ')}>
              <CommentMeta
                pr={pr}
                actorsMap={actorsMap}
                timestamp={comment?.createdAt}
                login={comment?.authorLogin}
                fallbackName={comment?.author?.name || comment?.authorName}
                helpers={helpers}
                isPending={isPending}
              />
              <CommentBody text={comment?.body} helpers={helpers} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeReviewThreadsData(pr, actorsMap, helpers) {
  const { asArray, getPreferredActorKey, getAuthorThreadResolutionPolicy, resolveActorDisplayName, parseSortableTime } = helpers;
  const reviewThreads = asArray(pr.reviewThreads);
  const prAuthorLogin = getPreferredActorKey(pr?.authorLogin, pr?.author).trim().toLowerCase();
  const policy = getAuthorThreadResolutionPolicy();

  const unresolvedReviewThreads = reviewThreads.filter((t) => t?.isResolved !== true);
  const resolvedReviewThreads = reviewThreads.filter((t) => t?.isResolved === true);
  const incorrectlyResolvedByAuthorCount = resolvedReviewThreads.reduce(
    (total, thread) => total + (getThreadResolutionInfo(thread, prAuthorLogin, policy, helpers).incorrectlyResolvedByAuthor ? 1 : 0),
    0,
  );

  // Thread-comment signatures, used to suppress orphaned review-summary
  // duplicates of comments that are really thread replies.
  const threadResponseSignatures = new Set();
  const threadResponseUrls = new Set();
  const addSignature = (actorVariants, occurredAt, body, url) => {
    if (url) threadResponseUrls.add(url);
    actorVariants.filter(Boolean).forEach((actorVariant) => {
      const sig = buildActorBodyMinuteSignature(actorVariant, occurredAt, body);
      if (sig) threadResponseSignatures.add(sig);
    });
  };
  const commentEvents = asArray(pr.commentEvents).filter((event) => {
    const type = String(event?.type || 'comment').trim().toLowerCase();
    const channel = String(event?.channel || '').trim().toLowerCase();
    return type === 'comment' && channel === 'thread';
  });
  commentEvents.forEach((event) => {
    addSignature(
      [String(event?.actor || '').trim(), resolveActorDisplayName(event?.actor, actorsMap)],
      event?.occurredAt,
      event?.body,
      String(event?.url || '').trim(),
    );
  });
  if (!threadResponseSignatures.size) {
    reviewThreads.forEach((thread) => {
      asArray(thread?.comments).forEach((comment) => {
        const actorLogin = String(comment?.authorLogin || '').trim();
        const actorName = String(comment?.author?.name || comment?.authorName || '').trim();
        addSignature(
          [actorLogin, actorName, resolveActorDisplayName(actorLogin, actorsMap, actorName)],
          comment?.createdAt,
          comment?.body,
          String(comment?.url || '').trim(),
        );
      });
    });
  }

  const reviewSummaries = (() => {
    const candidates = asArray(pr.reviews)
      .filter((review) => String(review?.state || '').trim().toUpperCase() === 'COMMENTED' && String(review?.body || '').trim())
      .filter((review) => {
        const createdAt = String(review?.submittedAt || '').trim();
        const body = String(review?.body || '').trim();
        const authorLogin = String(review?.authorLogin || '').trim();
        const authorName = String(review?.authorName || review?.author?.name || '').trim();
        const reviewUrl = String(review?.url || '').trim();
        if (reviewUrl && threadResponseUrls.has(reviewUrl)) return false;
        const authorVariants = [authorLogin, authorName, resolveActorDisplayName(authorLogin, actorsMap, authorName)].filter(Boolean);
        return !authorVariants.some((variant) => {
          const sig = buildActorBodyMinuteSignature(variant, createdAt, body);
          return sig && threadResponseSignatures.has(sig);
        });
      })
      .map((review) => ({
        id: String(review?.id || '').trim(),
        createdAt: String(review?.submittedAt || '').trim(),
        authorLogin: String(review?.authorLogin || '').trim(),
        authorName: String(review?.authorName || review?.author?.name || '').trim(),
        body: String(review?.body || '').trim(),
        url: String(review?.url || '').trim(),
        state: String(review?.state || '').trim(),
      }));

    const seenKeys = new Set();
    return candidates
      .filter((review) => {
        const key = review.id || `${review.createdAt}|${review.authorLogin}|${review.body}|${review.state}`;
        if (!key || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .sort((a, b) => parseSortableTime(a?.createdAt) - parseSortableTime(b?.createdAt));
  })();

  const topLevelComments = (() => {
    const explicit = asArray(pr.comments).map((comment) => ({
      id: String(comment?.id || '').trim(),
      createdAt: String(comment?.createdAt || '').trim(),
      authorLogin: String(comment?.authorLogin || '').trim(),
      authorName: String(comment?.authorName || comment?.author?.name || '').trim(),
      body: String(comment?.body || '').trim(),
      url: String(comment?.url || '').trim(),
      state: String(comment?.state || '').trim(),
    }));
    const fallback = explicit.length
      ? []
      : asArray(pr.commentEvents)
          .filter((event) => {
            const type = String(event?.type || 'comment').trim().toLowerCase();
            const channel = String(event?.channel || 'top-level').trim().toLowerCase();
            return type === 'comment' && channel !== 'thread';
          })
          .map((event) => ({
            id: String(event?.sourceId || '').trim(),
            createdAt: String(event?.occurredAt || '').trim(),
            authorLogin: String(event?.actor || '').trim(),
            authorName: String(event?.authorName || '').trim(),
            body: String(event?.body || '').trim(),
            url: String(event?.url || '').trim(),
            state: '',
          }));

    const seenKeys = new Set();
    return [...explicit, ...fallback]
      .filter((comment) => {
        const key = comment.id || `${comment.createdAt}|${comment.authorLogin}|${comment.body}`;
        if (!key || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .sort((a, b) => parseSortableTime(a?.createdAt) - parseSortableTime(b?.createdAt));
  })();

  return { reviewThreads, unresolvedReviewThreads, resolvedReviewThreads, incorrectlyResolvedByAuthorCount, reviewSummaries, topLevelComments, prAuthorLogin, policy };
}

export function ReviewThreadsSection({ pr, actorsMap }) {
  const helpers = useHelpers();
  const data = useMemo(() => computeReviewThreadsData(pr, actorsMap, helpers), [pr, actorsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const uiState = useMemo(() => helpers.readReviewConversationsUiState(pr), [pr]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filterMode, setFilterMode] = useState(uiState.conversationFilterMode);
  const [showSummaryCards, setShowSummaryCards] = useState(uiState.showSummaryCards);

  const updateUiState = (nextFilterMode, nextShowSummaryCards) => {
    helpers.writeReviewConversationsUiState(uiState.stateKey, nextFilterMode, nextShowSummaryCards);
  };

  const { reviewThreads, unresolvedReviewThreads, resolvedReviewThreads, incorrectlyResolvedByAuthorCount, reviewSummaries, topLevelComments, prAuthorLogin, policy } = data;

  if (!reviewThreads.length && !topLevelComments.length && !reviewSummaries.length) return null;

  const countLabel = `Review conversations (${resolvedReviewThreads.length}/${reviewThreads.length})`;
  const warningText =
    incorrectlyResolvedByAuthorCount > 0
      ? `(Warning: ${incorrectlyResolvedByAuthorCount} thread${incorrectlyResolvedByAuthorCount === 1 ? '' : 's'} incorrectly resolved by PR author)`
      : '';

  const visibleThreads = filterMode === 'all' ? reviewThreads : filterMode === 'resolved' ? resolvedReviewThreads : unresolvedReviewThreads;
  const topLevelUrl = topLevelComments.find((c) => String(c?.url || '').trim())?.url || '';
  const reviewSummaryUrl = reviewSummaries.find((r) => String(r?.url || '').trim())?.url || '';

  const summaryContent = warningText ? (
    <>
      <span>{countLabel} </span>
      <span className="insight-section-warning-text">{warningText}</span>
    </>
  ) : null;

  return (
    <InsightSection
      summaryText={countLabel}
      summaryContent={summaryContent}
      sectionKey="review-conversations"
      className={incorrectlyResolvedByAuthorCount > 0 ? 'insight-section-review-conversations-warning insight-section-warning' : ''}
    >
      <div>
        {reviewThreads.length > 0 && (
          <div className="insight-thread-filter">
            <button
              type="button"
              className={`insight-thread-filter-btn${filterMode === 'all' ? ' insight-thread-filter-btn-active' : ''}`}
              onClick={() => {
                setFilterMode('all');
                updateUiState('all', showSummaryCards);
              }}
            >
              All ({reviewThreads.length})
            </button>
            <button
              type="button"
              className={`insight-thread-filter-btn${filterMode === 'unresolved' ? ' insight-thread-filter-btn-active' : ''}`}
              onClick={() => {
                setFilterMode('unresolved');
                updateUiState('unresolved', showSummaryCards);
              }}
            >
              Unresolved ({unresolvedReviewThreads.length})
            </button>
            <button
              type="button"
              className={`insight-thread-filter-btn${filterMode === 'resolved' ? ' insight-thread-filter-btn-active' : ''}`}
              onClick={() => {
                setFilterMode('resolved');
                updateUiState('resolved', showSummaryCards);
              }}
            >
              Resolved ({resolvedReviewThreads.length})
            </button>
            <button
              type="button"
              className={`insight-thread-summary-toggle-btn${showSummaryCards ? ' insight-thread-summary-toggle-btn-on' : ' insight-thread-summary-toggle-btn-off'}`}
              onClick={() => {
                setShowSummaryCards(!showSummaryCards);
                updateUiState(filterMode, !showSummaryCards);
              }}
            >
              Summaries: {showSummaryCards ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {showSummaryCards && (
          <div>
            {topLevelComments.length > 0 && (
              <div className="insight-thread insight-thread-top-level">
                <div className="insight-thread-title insight-event-header insight-thread-title-top-level">
                  <span>Top-level PR comments | {topLevelComments.length} comments</span>
                  {topLevelUrl && (
                    <a className="insight-event-link" href={topLevelUrl} target="_blank" rel="noopener noreferrer">
                      View →
                    </a>
                  )}
                </div>
                <div className="insight-thread-comments">
                  {topLevelComments.map((comment, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={comment.id || i} className="insight-thread-comment insight-thread-comment-submitted">
                      <CommentMeta pr={pr} actorsMap={actorsMap} timestamp={comment.createdAt} login={comment.authorLogin} fallbackName={comment.authorName} helpers={helpers} />
                      <CommentBody text={comment.body} helpers={helpers} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewSummaries.length > 0 && (
              <div className="insight-thread insight-thread-top-level">
                <div className="insight-thread-title insight-event-header insight-thread-title-top-level">
                  <span>Review summaries | {reviewSummaries.length} reviews</span>
                  {reviewSummaryUrl && (
                    <a className="insight-event-link" href={reviewSummaryUrl} target="_blank" rel="noopener noreferrer">
                      View →
                    </a>
                  )}
                </div>
                <div className="insight-thread-comments">
                  {reviewSummaries.map((review, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={review.id || i} className="insight-thread-comment insight-thread-comment-submitted">
                      <CommentMeta
                        pr={pr}
                        actorsMap={actorsMap}
                        timestamp={review.createdAt}
                        login={review.authorLogin}
                        fallbackName={review.authorName}
                        suffix={` review (${String(review.state || 'COMMENTED').toUpperCase()})`}
                        helpers={helpers}
                      />
                      <CommentBody text={review.body} helpers={helpers} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {reviewThreads.length > 0 && (
          <div>
            {visibleThreads.length === 0 ? (
              <div className="insight-subtle">
                {filterMode === 'resolved'
                  ? 'No resolved review conversations.'
                  : filterMode === 'all'
                    ? 'No review conversations.'
                    : 'No unresolved review conversations.'}
              </div>
            ) : (
              visibleThreads.map((thread, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <ReviewThreadCard key={index} thread={thread} index={index} pr={pr} actorsMap={actorsMap} prAuthorLogin={prAuthorLogin} policy={policy} helpers={helpers} />
              ))
            )}
          </div>
        )}
      </div>
    </InsightSection>
  );
}
