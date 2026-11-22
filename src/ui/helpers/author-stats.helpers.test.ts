import { authorStatsRangeStart, buildAuthorStats, formatWait, median, percentile90 } from './author-stats.helpers';

const key = (login: unknown) => String(login || '').trim().toLowerCase();
const review = (authorLogin: string, submittedAt: string, state = 'COMMENTED') => ({ authorLogin, submittedAt, state });
const pr = (number: number, data: Record<string, unknown>, repo = 'acme/web') => ({
  prNumber: String(number),
  repo,
  data: { number: String(number), authorLogin: 'Ana', createdAt: '2026-07-01T00:00:00Z', ...data },
});

describe('median', () => {
  test('given odd, even and no values, then the middle, the mean of the middle two, and null', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('buildAuthorStats', () => {
  test("given an author's PRs, then medians, changes requested and top reviewers come from theirs alone", () => {
    const stats = buildAuthorStats(
      [
        pr(1, {
          reviews: [review('ana', '2026-07-01T00:30:00Z'), review('bo', '2026-07-01T02:00:00Z', 'CHANGES_REQUESTED'), review('cy', '2026-07-01T05:00:00Z')],
          mergedAt: '2026-07-02T00:00:00Z',
          additions: '10',
          deletions: '5',
        }),
        pr(2, { reviews: [review('bo', '2026-07-01T04:00:00Z', 'APPROVED'), review('bo', '2026-07-01T06:00:00Z')], additions: 100, deletions: 0 }),
        pr(3, { reviews: [] }),
        // Someone else's PR.
        pr(4, { authorLogin: 'bo', reviews: [review('ana', '2026-07-01T01:00:00Z')], additions: 9999 }),
      ],
      'ana',
      key,
    );

    expect(stats).toMatchObject({
      prs: 3,
      // PR 1's first review by someone else is 2h in (Ana's own reply doesn't count); PR 2's is 4h.
      firstReviewMs: 3 * 60 * 60 * 1000,
      firstReviewPrs: 2,
      mergeMs: 24 * 60 * 60 * 1000,
      mergedPrs: 1,
      size: (15 + 100) / 2,
      sizedPrs: 2,
      changesRequestedPrs: 1,
      reviewedPrs: 2,
      // Bo reviewed both PRs (twice on PR 2, counted once).
      topReviewers: [
        { login: 'bo', prs: 2 },
        { login: 'cy', prs: 1 },
      ],
    });
  });

  test("given bots' reviews (Copilot, an app, a [bot] account), then they don't count as reviews", () => {
    const stats = buildAuthorStats(
      [
        pr(1, {
          reviews: [
            review('copilot-pull-request-reviewer', '2026-07-01T00:05:00Z'),
            review('app/coderabbitai', '2026-07-01T00:06:00Z', 'CHANGES_REQUESTED'),
            review('renovate[bot]', '2026-07-01T00:07:00Z'),
            review('bo', '2026-07-01T02:00:00Z'),
          ],
        }),
        pr(2, { reviews: [review('copilot-pull-request-reviewer', '2026-07-01T00:05:00Z')] }),
      ],
      'ana',
      key,
    );
    expect(stats.firstReviewMs).toBe(2 * 60 * 60 * 1000);
    expect(stats.reviewedPrs).toBe(1);
    expect(stats.changesRequestedPrs).toBe(0);
    expect(stats.topReviewers).toEqual([{ login: 'bo', prs: 1 }]);
  });

  test('given missing or odd dates, then those PRs are left out of the medians', () => {
    const stats = buildAuthorStats(
      [
        pr(1, { createdAt: '', reviews: [review('bo', '2026-07-01T02:00:00Z')], mergedAt: '2026-07-02T00:00:00Z' }),
        pr(2, { reviews: [review('bo', ''), review('cy', '2026-07-01T01:00:00Z')] }),
        // Merged "before" it was created.
        pr(3, { mergedAt: '2026-06-01T00:00:00Z' }),
      ],
      'ana',
      key,
    );
    expect(stats.firstReviewMs).toBe(60 * 60 * 1000);
    expect(stats.firstReviewPrs).toBe(1);
    expect(stats.mergeMs).toBeNull();
    expect(stats.size).toBeNull();
  });

  test('given a PR opened as a draft, then its first review waits from when it was marked ready, not created', () => {
    const stats = buildAuthorStats(
      [pr(1, { readyForReviewAt: '2026-07-03T00:00:00Z', reviews: [review('bo', '2026-07-03T02:00:00Z')] })],
      'ana',
      key,
    );
    expect(stats.firstReviewMs).toBe(2 * 60 * 60 * 1000);
  });

  test('given a review while it was still a draft, then it waited no time once ready (not left out)', () => {
    const stats = buildAuthorStats(
      [pr(1, { readyForReviewAt: '2026-07-03T00:00:00Z', reviews: [review('bo', '2026-07-02T00:00:00Z')] })],
      'ana',
      key,
    );
    expect(stats.firstReviewMs).toBe(0);
    expect(stats.firstReviewPrs).toBe(1);
  });

  test('given a row saved before createdAt was kept, then its "opened" event is when it was created', () => {
    const stats = buildAuthorStats(
      [pr(1, { createdAt: undefined, activityEvents: [{ type: 'opened', occurredAt: '2026-07-01T00:00:00Z' }], mergedAt: '2026-07-01T06:00:00Z' })],
      'ana',
      key,
    );
    expect(stats.mergeMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe('buildAuthorStats: sources, team and range', () => {
  const H = 60 * 60 * 1000;
  const rows = [
    pr(1, { reviews: [review('bo', '2026-07-01T01:00:00Z', 'CHANGES_REQUESTED')], additions: 10 }),
    pr(2, { reviews: [review('bo', '2026-07-01T05:00:00Z')], additions: 50 }),
    pr(3, { authorLogin: 'bo', reviews: [review('ana', '2026-07-01T09:00:00Z')], additions: 400 }),
    pr(4, { authorLogin: 'cy', createdAt: '2026-01-01T00:00:00Z', reviews: [review('ana', '2026-01-01T20:00:00Z', 'CHANGES_REQUESTED')] }),
  ];

  test("each number's PRs, longest wait (or biggest) first, with their value", () => {
    const { sources } = buildAuthorStats(rows, 'ana', key);
    expect(sources.firstReview.map(({ entry, value }) => [entry.prNumber, value])).toEqual([
      ['2', 5 * H],
      ['1', 1 * H],
    ]);
    expect(sources.size.map(({ entry }) => entry.prNumber)).toEqual(['2', '1']);
    expect(sources.changesRequested.map(({ entry }) => entry.prNumber)).toEqual(['1']);
    expect(sources.merge).toEqual([]);
  });

  test("the team's medians come from every author's PRs", () => {
    const { team } = buildAuthorStats(rows, 'ana', key);
    // Waits 1h, 5h, 9h, 20h; sizes 10, 50, 400.
    expect(team).toEqual({ firstReviewMs: 7 * H, mergeMs: null, size: 50, changesRequestedShare: 0.5 });
  });

  test('with a start, only PRs opened since then count, for the author and the team', () => {
    const since = authorStatsRangeStart('90d', Date.parse('2026-07-15T00:00:00Z'));
    const stats = buildAuthorStats(rows, 'ana', key, { since });
    expect(stats.prs).toBe(2);
    expect(stats.team.firstReviewMs).toBe(5 * H);
    expect(stats.team.changesRequestedShare).toBeCloseTo(1 / 3);
    expect(authorStatsRangeStart('all', Date.now())).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('formatWait', () => {
  test('given minutes, hours and days, then the unit that reads best', () => {
    expect(formatWait(0)).toBe('<1m');
    expect(formatWait(10 * 1000)).toBe('<1m');
    expect(formatWait(90 * 1000)).toBe('2m');
    expect(formatWait(25 * 60 * 1000)).toBe('25m');
    expect(formatWait(5 * 60 * 60 * 1000)).toBe('5h');
    expect(formatWait(84 * 60 * 60 * 1000)).toBe('3.5 days');
    expect(formatWait(328.5 * 24 * 60 * 60 * 1000)).toBe('329 days');
  });
});

describe('buildAuthorStats: reviews given, months, sizes and the slowest 1 in 10', () => {
  const H = 60 * 60 * 1000;

  test("their reviews of other people's PRs: how many, how soon, how they ended, and whose", () => {
    const rows = [
      pr(1, { authorLogin: 'bo', reviews: [review('ana', '2026-07-01T02:00:00Z'), review('ana', '2026-07-01T09:00:00Z', 'APPROVED')] }),
      pr(2, { authorLogin: 'bo', reviews: [review('ana', '2026-07-01T06:00:00Z', 'CHANGES_REQUESTED')] }),
      pr(3, { authorLogin: 'cy', readyForReviewAt: '2026-07-02T00:00:00Z', reviews: [review('ana', '2026-07-02T01:00:00Z')] }),
      // Their own PR, and one they didn't review, don't count.
      pr(4, { reviews: [review('ana', '2026-07-01T01:00:00Z')] }),
      pr(5, { authorLogin: 'cy', reviews: [review('bo', '2026-07-01T01:00:00Z')] }),
    ];
    const { given } = buildAuthorStats(rows, 'ana', key);
    expect(given).toMatchObject({ prs: 3, approvedPrs: 1, changesRequestedPrs: 1, firstResponsePrs: 3, firstResponseMs: 2 * H, firstResponseP90: null });
    // Every reviewer's first review: ana's 2h, 6h, 1h and bo's 1h on #5 (ana's own #4 by ana is left out).
    expect(given.teamFirstResponseMs).toBe(1.5 * H);
    expect(given.topAuthors).toEqual([{ login: 'bo', prs: 2 }, { login: 'cy', prs: 1 }]);
    expect(given.sources.map(({ entry, value }) => [entry.prNumber, value])).toEqual([['2', 6 * H], ['1', 2 * H], ['3', 1 * H]]);
  });

  test('their PRs by the month opened, with empty months in between', () => {
    const rows = [
      pr(1, { createdAt: '2026-05-10T12:00:00Z', reviews: [review('bo', '2026-05-10T14:00:00Z')] }),
      pr(2, { createdAt: '2026-07-10T12:00:00Z', mergedAt: '2026-07-11T12:00:00Z' }),
      pr(3, { createdAt: '2026-07-20T12:00:00Z', mergedAt: '2026-07-20T18:00:00Z' }),
    ];
    const { months } = buildAuthorStats(rows, 'ana', key);
    expect(months).toEqual([
      { month: '2026-05', prs: 1, firstReviewMs: 2 * H, mergeMs: null },
      { month: '2026-06', prs: 0, firstReviewMs: null, mergeMs: null },
      { month: '2026-07', prs: 2, firstReviewMs: null, mergeMs: 15 * H },
    ]);
  });

  test('at most the last 12 months', () => {
    const rows = [pr(1, { createdAt: '2024-01-15T12:00:00Z' }), pr(2, { createdAt: '2026-07-15T12:00:00Z' })];
    const { months } = buildAuthorStats(rows, 'ana', key);
    expect(months).toHaveLength(12);
    expect(months[0]?.month).toBe('2025-08');
    expect(months[11]).toMatchObject({ month: '2026-07', prs: 1 });
  });

  test('their PRs by size: how long small, medium and large ones waited', () => {
    const rows = [
      pr(1, { additions: 20, deletions: 5, reviews: [review('bo', '2026-07-01T01:00:00Z')] }),
      pr(2, { additions: 300, reviews: [review('bo', '2026-07-01T10:00:00Z')] }),
      pr(3, { additions: 900, deletions: 100, mergedAt: '2026-07-03T00:00:00Z' }),
      pr(4, {}),
    ];
    const { bySize } = buildAuthorStats(rows, 'ana', key);
    expect(bySize.map(({ label, prs, firstReviewMs, mergeMs }) => [label, prs, firstReviewMs, mergeMs])).toEqual([
      ['Under 100 lines', 1, 1 * H, null],
      ['100 to 499 lines', 1, 10 * H, null],
      ['500+ lines', 1, null, 48 * H],
    ]);
  });

  test('the slowest 1 in 10, once there are at least 5 values', () => {
    expect(percentile90([1, 2, 3, 4])).toBeNull();
    expect(percentile90([5, 1, 4, 2, 3])).toBe(5);
    expect(percentile90([...Array(20)].map((_, i) => i + 1))).toBe(18);
    const rows = [1, 2, 3, 4, 10].map((hours, i) =>
      pr(i + 1, { reviews: [review('bo', new Date(Date.parse('2026-07-01T00:00:00Z') + hours * H).toISOString())] }),
    );
    expect(buildAuthorStats(rows, 'ana', key).p90).toEqual({ firstReviewMs: 10 * H, mergeMs: null, size: null });
  });
});
