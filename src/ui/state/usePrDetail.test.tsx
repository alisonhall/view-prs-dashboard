/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { clearPrDetailCache, fetchPrDetailsInto, PR_DETAIL_CACHE_LIMIT, usePrDetail } from './usePrDetail';
import type { PrData } from '../types/pr-data';

const slimRow = (number: string, version = 'v1'): PrData => ({
  number,
  title: `PR ${number}`,
  detailSlim: true,
  detailVersion: version,
  activityTimeline: [],
  activityEvents: [{ type: 'comment', actor: 'alice' }],
  reviewThreads: [{ id: 't1', comments: [{ id: 'c1', authorLogin: 'alice', mentions: ['bob'] }] }],
  commentEvents: [],
});

const detailFor = (number: string) => ({
  activityTimeline: [{ date: '2026-01-01', events: [{ type: 'comment', actor: 'alice', body: `Text of ${number}` }] }],
  activityEvents: [{ type: 'comment', actor: 'alice', body: `Text of ${number}` }],
  reviewThreads: [{ id: 't1', comments: [{ id: 'c1', authorLogin: 'alice', body: '@bob look' }] }],
  commentEvents: [{ type: 'comment', actor: 'alice', body: `Text of ${number}` }],
});

const answer = (body: unknown, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

describe('usePrDetail', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    clearPrDetailCache();
    fetchMock = jest.fn((input: string) => {
      const number = new URL(input, 'http://x').searchParams.get('prNumber') || '';
      return answer({ ok: true, detailVersion: 'v1', detail: detailFor(number) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  test("given a slim row, when the hook runs, then it gives the slim row until the detail arrives, then the row with it", async () => {
    const row = slimRow('5');
    const { result } = renderHook(() => usePrDetail(row, 'owner/repo', '5'));

    expect(result.current.pr).toBe(row);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith('/view-prs/pr-detail?repo=owner%2Frepo&prNumber=5', expect.anything());
    expect(result.current.pr.detailSlim).toBe(false);
    expect(result.current.pr.title).toBe('PR 5');
    expect(result.current.pr.reviewThreads?.[0]?.comments?.[0]?.body).toBe('@bob look');
    expect(result.current.pr.activityTimeline).toHaveLength(1);
  });

  test("given a row that isn't slim, when the hook runs, then it's given as it is and nothing is fetched", () => {
    const row: PrData = { number: '5', reviewThreads: [] };
    const { result } = renderHook(() => usePrDetail(row, 'owner/repo', '5'));
    expect(result.current.pr).toBe(row);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("given a PR's detail fetched before, when it's shown again with the same version, then it isn't fetched again - but a new version is", async () => {
    const first = renderHook(() => usePrDetail(slimRow('5'), 'owner/repo', '5'));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const again = renderHook(() => usePrDetail(slimRow('5'), 'owner/repo', '5'));
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.pr.commentEvents).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const changed = renderHook(() => usePrDetail(slimRow('5', 'v2'), 'owner/repo', '5'));
    expect(changed.result.current.loading).toBe(true);
    await waitFor(() => expect(changed.result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("given the PR shown changes (a new version), when its detail is fetched again, then the text it had stays until the new one arrives", async () => {
    let release: () => void = () => {};
    const { result, rerender } = renderHook(({ row }) => usePrDetail(row, 'owner/repo', '5'), { initialProps: { row: slimRow('5') } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, detail: { ...detailFor('5'), commentEvents: [{ body: 'Newer' }] } }) } as Response);
        }),
    );
    rerender({ row: slimRow('5', 'v2') });

    expect(result.current.loading).toBe(true);
    expect(result.current.pr.commentEvents?.[0]?.body).toBe('Text of 5');
    await act(async () => release());
    await waitFor(() => expect(result.current.pr.commentEvents?.[0]?.body).toBe('Newer'));
    expect(result.current.loading).toBe(false);
  });

  test(`keeps only the last ${PR_DETAIL_CACHE_LIMIT} PRs' detail`, async () => {
    for (let index = 0; index <= PR_DETAIL_CACHE_LIMIT; index += 1) {
      const { result, unmount } = renderHook(() => usePrDetail(slimRow(String(index)), 'owner/repo', String(index)));
      await waitFor(() => expect(result.current.loading).toBe(false));
      unmount();
    }
    fetchMock.mockClear();

    const newest = renderHook(() => usePrDetail(slimRow(String(PR_DETAIL_CACHE_LIMIT)), 'owner/repo', String(PR_DETAIL_CACHE_LIMIT)));
    expect(newest.result.current.loading).toBe(false);
    const oldest = renderHook(() => usePrDetail(slimRow('0'), 'owner/repo', '0'));
    expect(oldest.result.current.loading).toBe(true);
    await waitFor(() => expect(oldest.result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("given the fetch fails, when retried, then it fetches again", async () => {
    fetchMock.mockImplementationOnce(() => answer({ ok: false, error: 'No' }, false, 500));
    const { result } = renderHook(() => usePrDetail(slimRow('5'), 'owner/repo', '5'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.pr.detailSlim).toBe(true);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.pr.detailSlim).toBe(false));
    expect(result.current.failed).toBe(false);
  });
});

describe('fetchPrDetailsInto', () => {
  test("given slim and full rows, when the export's keys are fetched, then the slim ones get their detail in one request and the payload itself is left as it was", async () => {
    const payload = {
      byPrNumber: {
        'owner/repo#5': { repo: 'owner/repo', prNumber: '5', data: slimRow('5') },
        'owner/repo#6': { repo: 'owner/repo', prNumber: '6', data: { number: '6', reviewThreads: [] } },
      },
    };
    const fetchImpl = jest.fn(() =>
      answer({ ok: true, byPrKey: { 'owner/repo#5': { repo: 'owner/repo', prNumber: '5', detailVersion: 'v1', detail: detailFor('5') } } }),
    );

    const result = await fetchPrDetailsInto(payload, ['owner/repo#5', 'owner/repo#6'], fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/view-prs/pr-details');
    expect(JSON.parse(String(init.body))).toEqual({ prs: [{ repo: 'owner/repo', prNumber: '5' }] });
    expect(result.byPrNumber?.['owner/repo#5']?.data?.commentEvents?.[0]?.body).toBe('Text of 5');
    expect(result.byPrNumber?.['owner/repo#6']).toBe(payload.byPrNumber['owner/repo#6']);
    expect(payload.byPrNumber['owner/repo#5'].data.detailSlim).toBe(true);
  });

  test("given no slim rows among the keys, then nothing is fetched", async () => {
    const payload = { byPrNumber: { 'owner/repo#6': { repo: 'owner/repo', prNumber: '6', data: { number: '6' } } } };
    const fetchImpl = jest.fn();
    expect(await fetchPrDetailsInto(payload, ['owner/repo#6'], fetchImpl as unknown as typeof fetch)).toBe(payload);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
