import { buildAuthorStats, formatWait, median } from './author-stats.helpers';

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

    expect(stats).toEqual({
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

  test('given a row saved before createdAt was kept, then its "opened" event is when it was created', () => {
    const stats = buildAuthorStats(
      [pr(1, { createdAt: undefined, activityEvents: [{ type: 'opened', occurredAt: '2026-07-01T00:00:00Z' }], mergedAt: '2026-07-01T06:00:00Z' })],
      'ana',
      key,
    );
    expect(stats.mergeMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe('formatWait', () => {
  test('given minutes, hours and days, then the unit that reads best', () => {
    expect(formatWait(10 * 1000)).toBe('1m');
    expect(formatWait(25 * 60 * 1000)).toBe('25m');
    expect(formatWait(5 * 60 * 60 * 1000)).toBe('5h');
    expect(formatWait(84 * 60 * 60 * 1000)).toBe('3.5 days');
  });
});
