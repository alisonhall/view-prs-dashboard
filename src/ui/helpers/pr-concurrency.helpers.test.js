/** @jest-environment jsdom */

const { createPrConcurrencyHelpers } = require("./pr-concurrency.helpers.js");

describe("pr concurrency helpers", () => {
  const { runWithConcurrencyLimit } = createPrConcurrencyHelpers();

  test("given more items than the concurrency limit, when running, then no more than the limit are in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6, 7];

    await runWithConcurrencyLimit(items, 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  test("given several items, when running, then every item is processed exactly once and results preserve order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrencyLimit(items, 2, async (item) => item * 10);

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  test("given one worker call throws, when running, then the rest still complete and the failure is captured as a result", async () => {
    const items = ["a", "b", "c"];
    const results = await runWithConcurrencyLimit(items, 2, async (item) => {
      if (item === "b") {
        throw new Error("boom");
      }
      return `ok:${item}`;
    });

    expect(results[0]).toBe("ok:a");
    expect(results[1]).toEqual({ ok: false, error: expect.any(Error) });
    expect(results[1].error.message).toBe("boom");
    expect(results[2]).toBe("ok:c");
  });

  test("given an empty item list, when running, then it resolves to an empty array without calling the worker", async () => {
    const worker = jest.fn();
    const results = await runWithConcurrencyLimit([], 3, worker);

    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  test("given a limit larger than the item count, when running, then it still processes every item without error", async () => {
    const results = await runWithConcurrencyLimit([1, 2], 10, async (item) => item + 1);
    expect(results).toEqual([2, 3]);
  });

  test("given no worker function, when running, then it resolves without throwing", async () => {
    const results = await runWithConcurrencyLimit([1, 2], 2);
    expect(results).toEqual([undefined, undefined]);
  });
});
