// A fetch that gives up when the whole answer - its body too - hasn't
// arrived in time, so a download that stalls part way (as Vite's dev proxy
// did with large responses: the last few KB never came and the connection
// stayed open) fails instead of leaving the caller waiting forever. Polls
// run one at a time, so a single stalled one used to stop the page updating
// for good ("Loading…" for ever on the first load).

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const FETCH_TIMEOUT_MS = 60000;

export const createFetchWithTimeout =
  (fetchImpl: FetchLike, timeoutMs: number = FETCH_TIMEOUT_MS): FetchLike =>
  (input, init = {}) => {
    if (typeof AbortController !== 'function') return fetchImpl(input, init);
    const controller = new AbortController();
    const label = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const timer = setTimeout(
      () => controller.abort(new Error(`No complete answer from ${label} in ${Math.round(timeoutMs / 1000)}s`)),
      timeoutMs,
    );
    // A caller's own signal still aborts it.
    const callerSignal = init.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort(callerSignal.reason);
      else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
    }
    const done = () => clearTimeout(timer);
    return fetchImpl(input, { ...init, signal: controller.signal }).then(
      (response) => {
        if (!response || typeof response !== 'object') {
          done();
          return response;
        }
        // The body is read later (json/text); the time limit holds until
        // it's read, then it's cleared.
        (['json', 'text', 'arrayBuffer', 'blob'] as const).forEach((method) => {
          const read = response[method];
          if (typeof read !== 'function') return;
          Object.defineProperty(response, method, {
            configurable: true,
            value: () => {
              const reading = read.call(response) as Promise<unknown>;
              reading.then(done, done);
              return reading;
            },
          });
        });
        return response;
      },
      (error) => {
        done();
        throw error;
      },
    );
  };
