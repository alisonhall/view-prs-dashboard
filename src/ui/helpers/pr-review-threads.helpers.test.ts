import type { PrData, ReviewThread } from '../types/pr-data.ts';
import {
  ALLOW_ALL_POLICY,
  buildReviewSummaries,
  buildThreadViews,
  buildTopLevelComments,
  countThreads,
  filterCount,
  getThreadResolutionInfo,
  groupThreadsByFile,
  isWaitingOnViewer,
  mentions,
  nextUnresolvedId,
  type ConversationsContext,
  type ThreadResolutionPolicy,
} from './pr-review-threads.helpers.ts';

const comment = (authorLogin: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  authorLogin,
  createdAt,
  body: `${authorLogin} said`,
  ...extra,
});

const thread = (id: string, comments: object[], extra: Partial<ReviewThread> = {}): ReviewThread => ({
  id,
  isResolved: false,
  comments,
  ...extra,
});

const CONTEXT: ConversationsContext = { prAuthorLogin: 'author', viewerLogin: 'me', policy: ALLOW_ALL_POLICY };

const policy = (mode: ThreadResolutionPolicy['mode'], allow: string[] = [], deny: string[] = []): ThreadResolutionPolicy => ({
  mode,
  allowLoginKeys: new Set(allow),
  denyLoginKeys: new Set(deny),
});

describe('getThreadResolutionInfo', () => {
  const resolvedByAuthor = thread('t', [comment('reviewer', '2026-01-01T00:00:00Z'), comment('author', '2026-01-02T00:00:00Z')], {
    isResolved: true,
    resolvedByLogin: 'Author',
  });

  test('allow-all: the author may resolve any thread', () => {
    expect(getThreadResolutionInfo(resolvedByAuthor, 'author', policy('allow-all'))).toEqual({
      resolvedByAuthor: true,
      incorrectlyResolvedByAuthor: false,
    });
  });

  test('allow-only: only threads started by someone on the allow list', () => {
    expect(getThreadResolutionInfo(resolvedByAuthor, 'author', policy('allow-only', ['someone-else'])).incorrectlyResolvedByAuthor).toBe(true);
    expect(getThreadResolutionInfo(resolvedByAuthor, 'author', policy('allow-only', ['reviewer'])).incorrectlyResolvedByAuthor).toBe(false);
  });

  test('deny-only: not threads started by someone on the deny list', () => {
    expect(getThreadResolutionInfo(resolvedByAuthor, 'author', policy('deny-only', [], ['reviewer'])).incorrectlyResolvedByAuthor).toBe(true);
    expect(getThreadResolutionInfo(resolvedByAuthor, 'author', policy('deny-only', [], ['other'])).incorrectlyResolvedByAuthor).toBe(false);
  });

  test('a thread the author started, or one someone else resolved, is never wrong', () => {
    const ownThread = thread('t', [comment('author', '2026-01-01T00:00:00Z')], { isResolved: true, resolvedByLogin: 'author' });
    expect(getThreadResolutionInfo(ownThread, 'author', policy('allow-only')).incorrectlyResolvedByAuthor).toBe(false);
    const byReviewer = { ...resolvedByAuthor, resolvedByLogin: 'reviewer' };
    expect(getThreadResolutionInfo(byReviewer, 'author', policy('allow-only'))).toEqual({ resolvedByAuthor: false, incorrectlyResolvedByAuthor: false });
  });
});

describe('mentions', () => {
  test('finds an @mention, case-insensitively, but not inside a longer name or an email', () => {
    expect(mentions('Thoughts, @Me?', 'me')).toBe(true);
    expect(mentions('@me-too should look', 'me')).toBe(false);
    expect(mentions('mail me@me.com', 'me')).toBe(false);
    expect(mentions('no mention', 'me')).toBe(false);
  });
});

describe('isWaitingOnViewer (an unresolved thread you took part in, answered by someone else or mentioning you)', () => {
  test('you started it and someone else replied last', () => {
    expect(isWaitingOnViewer(thread('t', [comment('me', '2026-01-01T00:00:00Z'), comment('author', '2026-01-02T00:00:00Z')]), 'me')).toBe(true);
  });

  test('you replied last: not waiting on you', () => {
    expect(isWaitingOnViewer(thread('t', [comment('author', '2026-01-01T00:00:00Z'), comment('me', '2026-01-02T00:00:00Z')]), 'me')).toBe(false);
  });

  test('you replied last but mentioned yourself back in? still mentions you', () => {
    const t = thread('t', [comment('author', '2026-01-01T00:00:00Z'), comment('me', '2026-01-02T00:00:00Z', { body: 'cc @me later' })]);
    expect(isWaitingOnViewer(t, 'me')).toBe(true);
  });

  test('you never took part: not waiting on you, even if mentioned', () => {
    const t = thread('t', [comment('author', '2026-01-01T00:00:00Z', { body: '@me fyi' })]);
    expect(isWaitingOnViewer(t, 'me')).toBe(false);
  });

  test('your unsubmitted draft reply does not answer it', () => {
    const t = thread('t', [
      comment('me', '2026-01-01T00:00:00Z'),
      comment('author', '2026-01-02T00:00:00Z'),
      comment('me', '2026-01-03T00:00:00Z', { state: 'PENDING' }),
    ]);
    expect(isWaitingOnViewer(t, 'me')).toBe(true);
  });

  test('a resolved thread, or no known viewer, is never waiting', () => {
    const t = thread('t', [comment('me', '2026-01-01T00:00:00Z'), comment('author', '2026-01-02T00:00:00Z')]);
    expect(isWaitingOnViewer({ ...t, isResolved: true }, 'me')).toBe(false);
    expect(isWaitingOnViewer(t, '')).toBe(false);
  });
});

describe('buildThreadViews and countThreads', () => {
  const pr: PrData = {
    reviewThreads: [
      thread('waiting', [comment('me', '2026-01-01T00:00:00Z', { path: 'src/a.ts', line: 9 }), comment('author', '2026-01-02T00:00:00Z')]),
      thread('open', [comment('bob', '2026-01-01T00:00:00Z', { path: 'src/a.ts', line: 3, url: 'https://x/t2' })]),
      thread('wrong', [comment('bob', '2026-01-01T00:00:00Z', { path: 'src/b.ts', originalLine: 5 })], { isResolved: true, resolvedByLogin: 'author' }),
      thread('resolved', [comment('bob', '2026-01-01T00:00:00Z')], { isResolved: true, resolvedByLogin: 'bob', isOutdated: true }),
    ],
  };
  const views = buildThreadViews(pr, { ...CONTEXT, policy: policy('deny-only', [], ['bob']) });

  test('gives each thread its state, file, line and comments oldest first', () => {
    expect(views.map((view) => [view.id, view.state, view.path, view.line])).toEqual([
      ['waiting', 'waiting', 'src/a.ts', 9],
      ['open', 'open', 'src/a.ts', 3],
      ['wrong', 'wrong', 'src/b.ts', 5],
      ['resolved', 'resolved', '', null],
    ]);
    expect(views[0]?.comments.map((c) => c.authorLogin)).toEqual(['me', 'author']);
    expect(views[1]?.url).toBe('https://x/t2');
    expect(views[3]?.isOutdated).toBe(true);
  });

  test('counts unresolved (waiting or open), waiting, and resolved by the wrong person', () => {
    expect(countThreads(views)).toEqual({ unresolved: 2, waiting: 1, wrong: 1, total: 4 });
  });

  test('"Unresolved" also counts the wrongly resolved; "Waiting on me" only those waiting', () => {
    expect(filterCount(views, 'unresolved')).toBe(3);
    expect(filterCount(views, 'waiting')).toBe(1);
    expect(filterCount(views, 'all')).toBe(4);
  });

  test('groups by file in the order files appear, threads by line, those on no file last; counts what the filter hides', () => {
    const all = groupThreadsByFile(views, 'all');
    expect(all.groups.map((group) => [group.path, group.threads.map((t) => t.id)])).toEqual([
      ['src/a.ts', ['open', 'waiting']],
      ['src/b.ts', ['wrong']],
      ['', ['resolved']],
    ]);
    expect(all.hiddenCount).toBe(0);
    expect(groupThreadsByFile(views, 'unresolved').hiddenCount).toBe(1);
    expect(groupThreadsByFile(views, 'waiting').groups.map((group) => group.path)).toEqual(['src/a.ts']);
  });

  test('"Next unresolved" steps through what "Unresolved" shows (the wrongly resolved too) in list order, wrapping', () => {
    expect(nextUnresolvedId(views, null)).toBe('open');
    expect(nextUnresolvedId(views, 'open')).toBe('waiting');
    expect(nextUnresolvedId(views, 'waiting')).toBe('wrong');
    expect(nextUnresolvedId(views, 'wrong')).toBe('open');
    // From a rightly resolved thread, the next one after it (wrapping).
    expect(nextUnresolvedId(views, 'resolved')).toBe('open');
    expect(nextUnresolvedId(views.filter((view) => view.state === 'resolved'), null)).toBeNull();
    expect(nextUnresolvedId(views.filter((view) => view.state === 'wrong'), null)).toBe('wrong');
  });
});

describe('buildTopLevelComments', () => {
  test('the PR comments oldest first, each once; else the non-thread comment events', () => {
    expect(
      buildTopLevelComments({
        comments: [
          { id: 'c2', createdAt: '2026-01-02T00:00:00Z', authorLogin: 'bob', body: 'later' },
          { id: 'c1', createdAt: '2026-01-01T00:00:00Z', authorLogin: 'amy', body: 'first' },
          { id: 'c1', createdAt: '2026-01-01T00:00:00Z', authorLogin: 'amy', body: 'first' },
        ],
      }).map((c) => c.id),
    ).toEqual(['c1', 'c2']);
    expect(
      buildTopLevelComments({
        commentEvents: [
          { sourceId: 'e1', occurredAt: '2026-01-01T00:00:00Z', actor: 'amy', type: 'comment', channel: 'top-level', body: 'hi' },
          { sourceId: 'e2', occurredAt: '2026-01-01T00:00:00Z', actor: 'amy', type: 'comment', channel: 'thread', body: 'in a thread' },
        ],
      }).map((c) => c.id),
    ).toEqual(['e1']);
  });
});

describe('buildReviewSummaries', () => {
  const names = (login: string) => login;

  test('COMMENTED reviews with text, not ones repeating a thread reply', () => {
    const pr: PrData = {
      reviews: [
        { id: 'r1', authorLogin: 'bob', state: 'COMMENTED', submittedAt: '2026-01-01T00:00:10Z', body: 'Overall looks fine' },
        { id: 'r2', authorLogin: 'bob', state: 'COMMENTED', submittedAt: '2026-01-02T00:00:20Z', body: 'Nit here' },
        { id: 'r3', authorLogin: 'bob', state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z', body: 'Ship it' },
        { id: 'r4', authorLogin: 'bob', state: 'COMMENTED', submittedAt: '2026-01-03T00:00:00Z', body: '' },
      ],
      reviewThreads: [thread('t', [comment('bob', '2026-01-02T00:00:05Z', { body: 'Nit here' })])],
    };
    expect(buildReviewSummaries(pr, names, {}).map((r) => r.id)).toEqual(['r1']);
  });
});
