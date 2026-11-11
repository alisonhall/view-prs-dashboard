const { createSerialRunner } = require("./pr-serial-run.helpers.ts");

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("createSerialRunner", () => {
  test("a call while a run is going doesn't start a second alongside it, but one more after it", async () => {
    const runs = [];
    let active = 0;
    let maxActive = 0;
    const task = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const run = deferred();
      runs.push(run);
      await run.promise;
      active -= 1;
    });
    const run = createSerialRunner(task);

    const first = run();
    const second = run();
    const third = run();
    expect(task).toHaveBeenCalledTimes(1);

    runs[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    // The calls made meanwhile ask for one more run, not one each.
    expect(task).toHaveBeenCalledTimes(2);
    runs[1].resolve();
    await Promise.all([first, second, third]);

    expect(task).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  test("once done, the next call runs again", async () => {
    const task = jest.fn(async () => {});
    const run = createSerialRunner(task);

    await run();
    await run();

    expect(task).toHaveBeenCalledTimes(2);
  });

  test("a failed run doesn't stop later calls from running", async () => {
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const run = createSerialRunner(task);

    await expect(run()).rejects.toThrow("network");
    await run();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
