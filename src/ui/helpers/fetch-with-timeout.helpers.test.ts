import { createFetchWithTimeout } from './fetch-with-timeout.helpers';

// A response whose body arrives when `finish` is called, or never.
const slowBodyResponse = (signal: AbortSignal | null | undefined) => {
  let finish: (value: unknown) => void = () => {};
  const body = new Promise((resolve, reject) => {
    finish = resolve;
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  return { response: { ok: true, status: 200, json: () => body } as unknown as Response, finish: (value: unknown) => finish(value) };
};

describe('createFetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a body that stops arriving fails once the time is up, instead of waiting for ever', async () => {
    const fetchImpl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(slowBodyResponse(init?.signal).response));
    const fetchWithTimeout = createFetchWithTimeout(fetchImpl, 1000);
    const response = await fetchWithTimeout('/view-prs/data');
    const reading = response.json();
    const failure = expect(reading).rejects.toThrow('No complete answer from /view-prs/data in 1s');
    jest.advanceTimersByTime(1000);
    await failure;
  });

  test('an answer that arrives in time is passed on, and the time limit is cleared', async () => {
    let finish: (value: unknown) => void = () => {};
    let signal: AbortSignal | undefined;
    const fetchImpl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal || undefined;
      const slow = slowBodyResponse(init?.signal);
      finish = slow.finish;
      return Promise.resolve(slow.response);
    });
    const fetchWithTimeout = createFetchWithTimeout(fetchImpl, 1000);
    const response = await fetchWithTimeout('/view-prs/data-meta');
    const reading = response.json();
    finish({ ok: true });
    await expect(reading).resolves.toEqual({ ok: true });
    jest.advanceTimersByTime(5000);
    expect(signal?.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a request that never answers at all fails too', async () => {
    const fetchImpl = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })),
    );
    const pending = createFetchWithTimeout(fetchImpl, 1000)('/view-prs/data');
    const failure = expect(pending).rejects.toThrow('in 1s');
    jest.advanceTimersByTime(1000);
    await failure;
  });

  test("the caller's own signal still aborts it, and its options are passed on", async () => {
    const fetchImpl = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
    );
    const caller = new AbortController();
    const pending = createFetchWithTimeout(fetchImpl, 1000)('/view-prs/data-delta', { method: 'POST', signal: caller.signal });
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    caller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });

  test('a failed request clears its time limit', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new Error('network down')));
    await expect(createFetchWithTimeout(fetchImpl, 1000)('/view-prs/data')).rejects.toThrow('network down');
    expect(jest.getTimerCount()).toBe(0);
  });
});
