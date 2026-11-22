import { buildAuthorWaitingPrs } from './author-waiting.helpers';

const key = (login: unknown) => String(login || '').trim().toLowerCase();
const review = (authorLogin: string, submittedAt: string, state = 'COMMENTED') => ({ authorLogin, submittedAt, state });
const pr = (number: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  prNumber: String(number),
  repo: 'acme/web',
  section: 'open' as const,
  ...extra,
  data: { number: String(number), authorLogin: 'Ana', createdAt: '2026-07-01T00:00:00Z', ...data },
});
const at = (iso: string) => Date.parse(iso);
const summary = (rows: ReturnType<typeof pr>[]) =>
  buildAuthorWaitingPrs(rows, 'ana', key).map(({ entry, reason, since }) => [entry.prNumber, reason, since]);

describe('buildAuthorWaitingPrs', () => {
  test('what each open PR waits on, and since when, longest first', () => {
    expect(
      summary([
        pr(1, { readyForReviewAt: '2026-07-03T00:00:00Z' }),
        pr(2, { reviews: [review('bo', '2026-07-02T00:00:00Z', 'CHANGES_REQUESTED')] }),
        pr(3, {
          reviews: [review('bo', '2026-07-02T00:00:00Z', 'CHANGES_REQUESTED')],
          commits: [{ committedAt: '2026-07-01T12:00:00Z' }, { committedAt: '2026-07-04T00:00:00Z' }],
        }),
        pr(4, { reviews: [review('bo', '2026-07-05T00:00:00Z', 'APPROVED')] }),
        pr(5, { reviews: [review('bo', '2026-07-01T06:00:00Z')] }),
      ]),
    ).toEqual([
      ['5', 'reviewed', at('2026-07-01T06:00:00Z')],
      ['2', 'changes-requested', at('2026-07-02T00:00:00Z')],
      ['1', 'first-review', at('2026-07-03T00:00:00Z')],
      ['3', 'updated', at('2026-07-04T00:00:00Z')],
      ['4', 'approved', at('2026-07-05T00:00:00Z')],
    ]);
  });

  test("a reviewer's later approval replaces their change request; a dismissal clears it", () => {
    expect(
      summary([
        pr(1, { reviews: [review('bo', '2026-07-02T00:00:00Z', 'CHANGES_REQUESTED'), review('bo', '2026-07-03T00:00:00Z', 'APPROVED')] }),
        pr(2, { reviews: [review('bo', '2026-07-02T00:00:00Z', 'CHANGES_REQUESTED'), review('bo', '2026-07-03T00:00:00Z', 'DISMISSED')] }),
      ]),
    ).toEqual([
      ['1', 'approved', at('2026-07-03T00:00:00Z')],
      ['2', 'reviewed', at('2026-07-03T00:00:00Z')],
    ]);
  });

  test("leaves out drafts, merged and closed PRs, other authors', and their own or bots' reviews", () => {
    expect(
      summary([
        pr(1, {}, { section: 'draft' }),
        pr(2, { mergedAt: '2026-07-02T00:00:00Z' }),
        pr(3, { closedAt: '2026-07-02T00:00:00Z' }),
        pr(4, { authorLogin: 'bo' }),
        pr(5, { reviews: [review('ana', '2026-07-02T00:00:00Z'), review('copilot-pull-request-reviewer[bot]', '2026-07-02T00:00:00Z')] }),
      ]),
    ).toEqual([['5', 'first-review', at('2026-07-01T00:00:00Z')]]);
  });
});
