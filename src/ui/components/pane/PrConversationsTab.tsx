import { useEffect, useMemo, useRef, useState } from 'react';
import type { PrData, PrDataPayload, PrEntry } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from '../ActorIdentity';
import { Button } from '../ui/Button';
import { Chip, ChipGroup } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { useOptionalPrData } from '../../state/PrDataContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { useRequestActivity } from '../../state/RequestActivityContext';
import { useReviewConversationsUiState } from '../../state/ReviewConversationsUiStateContext';
import { useAuthorThreadResolutionPolicy } from '../../state/useAuthorThreadResolutionPolicy';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import { postJson } from '../../helpers/pr-http.helpers.ts';
import { createPrReviewConversationsUiStateHelpers } from '../../helpers/pr-review-conversations-ui-state.helpers.ts';
import { toPlainLine } from '../../helpers/pr-row-summary.helpers.ts';
import {
  buildReviewSummaries,
  buildThreadViews,
  buildTopLevelComments,
  countThreads,
  filterCount,
  groupThreadsByFile,
  nextUnresolvedId,
  threadConfirmationsFor,
  type ConversationFilter,
  type PlainComment,
  type ThreadComment,
  type ThreadState,
  type ThreadView,
} from '../../helpers/pr-review-threads.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();
const { getReviewConversationsStateKey, normalizeReviewConversationsUiState } = createPrReviewConversationsUiStateHelpers();

/**
 * The detail pane's Conversations tab (UI_REDESIGN_PLAN.md, phase 6):
 * - A summary line: unresolved, waiting on you, and resolved by the wrong
 *   person (the PR author, against the "PR author thread resolution" rule).
 * - Filters: Unresolved (the default; it includes the wrongly resolved,
 *   and those resolved for you that you haven't confirmed),
 *   Waiting on me (an unresolved thread you took part in, answered by
 *   someone else or mentioning you), To check (threads you started that
 *   someone else resolved, until you confirm they were handled), All.
 *   Remembered per PR.
 * - "Next unresolved" opens and focuses the next thread Unresolved shows.
 * - Threads grouped by file in collapsible groups, each one line (who
 *   started it, the start of its first comment, line, state, replies)
 *   that expands to its comments.
 * - The PR's top-level comments and review summaries, collapsed, below.
 */
export interface PrConversationsTabProps {
  pr: PrData;
  actorsMap?: ActorsMap;
  // Its repo and number, for saving a confirmation; and where the
  // refreshed data goes after one.
  entry?: PrEntry;
  onDataRefresh?: (payload: PrDataPayload) => void;
}

// POST /view-prs/thread-checks's reply: the refreshed data on success.
type ThreadCheckRouteResult = { ok?: boolean; error?: string; prData?: PrDataPayload };

const STATE_LABEL: Record<ThreadState, string> = {
  waiting: 'waiting on you',
  open: 'open',
  wrong: 'resolved by the PR author',
  resolved: 'resolved',
};

function CommentBlock({ comment, pr, actorsMap, suffix }: { comment: ThreadComment | PlainComment; pr: PrData; actorsMap?: ActorsMap; suffix?: string }) {
  const { renderMarkdownAsHtml } = usePrInsightsDisplay();
  const pending = 'isPending' in comment && comment.isPending;
  return (
    <div className="pr-conv-comment" data-pending={pending ? 'true' : undefined}>
      <p className="pr-conv-comment-meta">
        <ActorIdentity row={pr} login={comment.authorLogin} actorsMap={actorsMap} fallbackName={comment.authorName} />
        {suffix}
        {comment.createdAt && <span className="pr-conv-comment-time"> · {formatIsoDatetime(comment.createdAt)}</span>}
        {pending && <span className="pr-conv-badge">Pending</span>}
      </p>
      <div
        className="insight-thread-body pr-markdown"
        dangerouslySetInnerHTML={{ __html: renderMarkdownAsHtml(comment.body || '(no comment body)') }}
      />
    </div>
  );
}

// A thread you started that someone else resolved: who, what suggests it
// was handled - the code under it changed since (GitHub marks it
// outdated), the resolver replied - and confirming it (or undoing that).
function ThreadCheckPanel({
  thread,
  pr,
  actorsMap,
  busy,
  error,
  onSetConfirmed,
}: {
  thread: ThreadView;
  pr: PrData;
  actorsMap?: ActorsMap;
  busy: boolean;
  error: string;
  onSetConfirmed: (confirmed: boolean) => void;
}) {
  const check = thread.check;
  if (!check) return null;
  const resolver = <ActorIdentity row={pr} login={check.resolvedByLogin} actorsMap={actorsMap} />;
  const resolverKey = check.resolvedByLogin.toLowerCase();
  const resolverReplied = thread.comments.some((comment) => comment.authorLogin.toLowerCase() === resolverKey);
  return (
    <div className="pr-conv-check-panel" data-confirmed={check.confirmed ? 'true' : undefined}>
      {check.byPrAuthor ? (
        <p className="pr-conv-callout">
          <Icon name="alert" size={14} />
          <span>You started this, and the PR author ({resolver}) resolved it - someone else should resolve your threads.</span>
        </p>
      ) : (
        <p>You started this, and {resolver} resolved it. Check it was handled.</p>
      )}
      <ul className="pr-conv-check-evidence">
        <li>{thread.isOutdated ? 'The code it was on has changed since (outdated)' : "The code it was on hasn't changed"}</li>
        <li>
          {resolver} {resolverReplied ? 'replied in it' : "didn't reply in it"}
        </li>
      </ul>
      <p className="pr-conv-check-actions">
        {check.confirmed ? (
          <>
            <span className="pr-conv-check-done">
              <Icon name="check" size={14} /> Confirmed handled
            </span>
            <button type="button" className="pr-conv-link-button" disabled={busy} onClick={() => onSetConfirmed(false)}>
              Undo
            </button>
          </>
        ) : (
          <Button icon="check" disabled={busy} onClick={() => onSetConfirmed(true)}>
            Confirm handled
          </Button>
        )}
        {error && <span className="pr-conv-check-error">{error}</span>}
      </p>
    </div>
  );
}

function ThreadItem({
  thread,
  pr,
  actorsMap,
  open,
  onToggle,
  checkBusy,
  checkError,
  onSetConfirmed,
}: {
  thread: ThreadView;
  pr: PrData;
  actorsMap?: ActorsMap;
  open: boolean;
  onToggle: () => void;
  checkBusy: boolean;
  checkError: string;
  onSetConfirmed: (confirmed: boolean) => void;
}) {
  const starter = thread.comments[0];
  const replies = thread.comments.length - 1;
  const hasPending = thread.comments.some((comment) => comment.isPending);
  return (
    <li className="pr-conv-thread" data-state={thread.state} data-thread-id={thread.id}>
      <button type="button" className="pr-conv-thread-row" aria-expanded={open} onClick={onToggle}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span className="pr-conv-thread-who">
          {starter ? <ActorIdentity row={pr} login={starter.authorLogin} actorsMap={actorsMap} fallbackName={starter.authorName} /> : 'Unknown'}
        </span>
        <span className="pr-conv-thread-text">{toPlainLine(starter?.body) || '(no comment body)'}</span>
        <span className="pr-conv-thread-meta">
          {thread.line != null && <span>L{thread.line}</span>}
          <span className="pr-conv-state" data-state={thread.state}>
            {STATE_LABEL[thread.state]}
          </span>
          {replies > 0 && (
            <span>
              {replies} repl{replies === 1 ? 'y' : 'ies'}
            </span>
          )}
          {thread.isOutdated && <span>outdated</span>}
          {hasPending && <span className="pr-conv-badge">Pending</span>}
          {thread.check && (
            <span className="pr-conv-check" data-confirmed={thread.check.confirmed ? 'true' : undefined}>
              {thread.check.confirmed ? 'confirmed' : 'to check'}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="pr-conv-thread-body">
          {thread.state === 'wrong' && (
            <p className="pr-conv-callout">
              <Icon name="alert" size={14} />
              Resolved by the PR author, but the thread resolution rule says the person who started it should resolve it.
            </p>
          )}
          <ThreadCheckPanel thread={thread} pr={pr} actorsMap={actorsMap} busy={checkBusy} error={checkError} onSetConfirmed={onSetConfirmed} />
          {thread.comments.map((comment) => (
            <CommentBlock key={comment.id} comment={comment} pr={pr} actorsMap={actorsMap} />
          ))}
          <p className="pr-conv-thread-footer">
            {thread.state !== 'open' && thread.state !== 'waiting' && thread.resolvedByLogin && (
              <span>
                Resolved by <ActorIdentity row={pr} login={thread.resolvedByLogin} actorsMap={actorsMap} />
              </span>
            )}
            {thread.url && (
              <a href={thread.url} target="_blank" rel="noopener noreferrer">
                View<span className="ui-visually-hidden"> this conversation</span> on GitHub
              </a>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

export function PrConversationsTab({ pr, actorsMap = {}, entry, onDataRefresh }: PrConversationsTabProps) {
  // Its repo's policy, when it has its own (Settings › Rules for a repo).
  const policy = useAuthorThreadResolutionPolicy(String(entry?.repo || '').trim());
  const { getEffectiveViewerLogin, resolveActorDisplayName } = useActorIdentity();
  const { getReviewConversationsUiState, setReviewConversationsUiState } = useReviewConversationsUiState();
  const payload = useOptionalPrData()?.payload;
  const { beginRequestActivity } = useRequestActivity();
  // Logins as GitHub gives them: the threads' comments are compared with
  // them (the resolution rule's lists hold every login of each person picked).
  const prAuthorLogin = String(pr?.authorLogin || pr?.author || '').trim().toLowerCase();
  const viewerLogin = String(getEffectiveViewerLogin(pr) || '').trim().toLowerCase();
  const repo = String(entry?.repo || '').trim();
  const prNumber = String(entry?.prNumber ?? pr?.number ?? '').trim();
  const confirmations = useMemo(
    () => threadConfirmationsFor(payload?.threadChecksByRepo, repo, prNumber),
    [payload?.threadChecksByRepo, repo, prNumber],
  );

  const threads = useMemo(
    () => buildThreadViews(pr, { prAuthorLogin, viewerLogin, policy, confirmations }),
    [pr, prAuthorLogin, viewerLogin, policy, confirmations],
  );
  const [checkBusyId, setCheckBusyId] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<{ threadId: string; text: string } | null>(null);
  const setConfirmed = async (thread: ThreadView, confirmed: boolean) => {
    if (!thread.check || !repo || !prNumber) return;
    setCheckBusyId(thread.id);
    setCheckError(null);
    const finishActivity = beginRequestActivity('threadCheck');
    try {
      const { response, result } = await postJson<ThreadCheckRouteResult>('/view-prs/thread-checks', {
        repo,
        prNumber,
        threadId: thread.check.threadId,
        signature: thread.check.signature,
        confirmed,
      });
      if (!response.ok || result.ok === false) {
        setCheckError({ threadId: thread.id, text: `Couldn't save: ${result.error || 'unknown error'}` });
        return;
      }
      if (result.prData && onDataRefresh) onDataRefresh(result.prData);
    } catch {
      setCheckError({ threadId: thread.id, text: "Couldn't save." });
    } finally {
      setCheckBusyId(null);
      finishActivity();
    }
  };
  const topLevelComments = useMemo(() => buildTopLevelComments(pr), [pr]);
  const reviewSummaries = useMemo(
    () => buildReviewSummaries(pr, resolveActorDisplayName as (login: string, map: Record<string, unknown>, fallback?: string) => string, actorsMap),
    [pr, resolveActorDisplayName, actorsMap],
  );
  const counts = countThreads(threads);

  const canWaitOnViewer = Boolean(viewerLogin);
  const stateKey = getReviewConversationsStateKey(pr);
  const [savedFilter, setFilterState] = useState<ConversationFilter>(
    () => normalizeReviewConversationsUiState(getReviewConversationsUiState(stateKey)).conversationFilterMode,
  );
  // "Waiting on me" and "To check" need the viewer: without them (no chip
  // for either), a saved one shows as Unresolved.
  const filter: ConversationFilter =
    (savedFilter === 'waiting' || savedFilter === 'check') && !canWaitOnViewer ? 'unresolved' : savedFilter;
  // "To check" shows once a thread was resolved for you (confirmed or not).
  const hasChecks = threads.some((thread) => thread.check);
  const unresolvedCount = filterCount(threads, 'unresolved');
  const setFilter = (next: ConversationFilter) => {
    setFilterState(next);
    setReviewConversationsUiState(stateKey, next);
  };
  const [openThreads, setOpenThreads] = useState<ReadonlySet<string>>(new Set());
  const [closedFiles, setClosedFiles] = useState<ReadonlySet<string>>(new Set());
  // The thread "Next unresolved" last went to, and the one to focus once
  // it has rendered.
  const lastNextRef = useRef<string | null>(null);
  const [focusThreadId, setFocusThreadId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusThreadId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(focusThreadId)}"] .pr-conv-thread-row`);
    row?.scrollIntoView?.({ block: 'nearest' });
    row?.focus();
    setFocusThreadId(null);
  }, [focusThreadId]);

  const toggleIn = (set: ReadonlySet<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const goToNextUnresolved = () => {
    const id = nextUnresolvedId(threads, lastNextRef.current);
    const target = threads.find((thread) => thread.id === id);
    if (!id || !target) return;
    lastNextRef.current = id;
    // "Waiting on me" may hide it; "Unresolved" and "All" show it.
    if (filter === 'waiting' && target.state !== 'waiting') setFilter('unresolved');
    setClosedFiles((files) => {
      const next = new Set(files);
      next.delete(target.path);
      return next;
    });
    setOpenThreads((open) => new Set(open).add(id));
    setFocusThreadId(id);
  };

  if (!threads.length && !topLevelComments.length && !reviewSummaries.length) {
    return <p className="pr-pane-none">No conversations</p>;
  }

  const { groups, hiddenCount } = groupThreadsByFile(threads, filter);

  return (
    <div className="pr-conv" ref={listRef}>
      {threads.length > 0 && (
        <>
          <p className="pr-conv-summary">
            <span>
              <strong>{counts.unresolved}</strong> unresolved
            </span>
            {canWaitOnViewer && (
              <span data-tone={counts.waiting ? 'attention' : undefined}>
                <strong>{counts.waiting}</strong> waiting on you
              </span>
            )}
            {counts.wrong > 0 && (
              <span data-tone="attention">
                <Icon name="alert" size={13} />
                <strong>{counts.wrong}</strong> resolved by the wrong person
              </span>
            )}
            {counts.toCheck > 0 && (
              <span data-tone="attention">
                <strong>{counts.toCheck}</strong> resolved for you to check
              </span>
            )}
          </p>

          <div className="pr-conv-toolbar">
            <ChipGroup label="Show">
              <Chip pressed={filter === 'unresolved'} count={unresolvedCount} onClick={() => setFilter('unresolved')}>
                Unresolved
              </Chip>
              {canWaitOnViewer && (
                <Chip pressed={filter === 'waiting'} count={counts.waiting} onClick={() => setFilter('waiting')}>
                  Waiting on me
                </Chip>
              )}
              {canWaitOnViewer && (hasChecks || filter === 'check') && (
                <Chip pressed={filter === 'check'} count={counts.toCheck} onClick={() => setFilter('check')}>
                  To check
                </Chip>
              )}
              <Chip pressed={filter === 'all'} count={counts.total} onClick={() => setFilter('all')}>
                All
              </Chip>
            </ChipGroup>
            <Button icon="arrowDown" disabled={unresolvedCount === 0} onClick={goToNextUnresolved}>
              Next unresolved
            </Button>
          </div>

          {groups.length === 0 && (
            <p className="pr-pane-none">
              {filter === 'waiting' ? 'Nothing is waiting on you' : filter === 'check' ? 'Nothing to check' : 'No unresolved conversations'}
            </p>
          )}
          {groups.map((group) => {
            const open = !closedFiles.has(group.path);
            return (
              <div key={group.path || '(no file)'} className="pr-conv-file">
                <button
                  type="button"
                  className="pr-conv-file-toggle"
                  aria-expanded={open}
                  onClick={() => setClosedFiles((files) => toggleIn(files, group.path))}
                >
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                  {group.path ? <code>{group.path}</code> : <span>Not on a file</span>}
                  <span className="pr-conv-file-count">· {group.threads.length}</span>
                </button>
                {open && (
                  <ul className="pr-conv-threads">
                    {group.threads.map((thread) => (
                      <ThreadItem
                        key={thread.id}
                        thread={thread}
                        pr={pr}
                        actorsMap={actorsMap}
                        open={openThreads.has(thread.id)}
                        onToggle={() => setOpenThreads((ids) => toggleIn(ids, thread.id))}
                        checkBusy={checkBusyId === thread.id}
                        checkError={checkError?.threadId === thread.id ? checkError.text : ''}
                        onSetConfirmed={(confirmed) => setConfirmed(thread, confirmed)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {hiddenCount > 0 && (
            <p className="pr-conv-hidden">
              {hiddenCount} {filter === 'unresolved' ? 'resolved' : 'other'} conversation{hiddenCount === 1 ? '' : 's'} hidden ·{' '}
              <button type="button" className="pr-conv-link-button" onClick={() => setFilter('all')}>
                Show all
              </button>
            </p>
          )}
        </>
      )}

      {topLevelComments.length > 0 && (
        <details className="insight-section" data-insight-key="pr comments">
          <summary>PR comments ({topLevelComments.length})</summary>
          {topLevelComments.map((comment, index) => (
            <CommentBlock key={comment.id || index} comment={comment} pr={pr} actorsMap={actorsMap} />
          ))}
        </details>
      )}
      {reviewSummaries.length > 0 && (
        <details className="insight-section" data-insight-key="review summaries">
          <summary>Review summaries ({reviewSummaries.length})</summary>
          {reviewSummaries.map((review, index) => (
            <CommentBlock key={review.id || index} comment={review} pr={pr} actorsMap={actorsMap} suffix=" reviewed" />
          ))}
        </details>
      )}
    </div>
  );
}
