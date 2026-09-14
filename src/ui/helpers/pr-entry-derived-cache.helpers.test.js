const {
  createEntryDerivedCache,
} = require("./pr-entry-derived-cache.helpers.js");

describe("pr entry derived cache helpers", () => {
  test("given the same entry and cache key, when getOrCompute is called twice, then the compute function only runs once", () => {
    const { getOrCompute } = createEntryDerivedCache();
    const entry = { id: 1 };
    const compute = jest.fn(() => ["bug"]);

    const first = getOrCompute(entry, "labels", compute);
    const second = getOrCompute(entry, "labels", compute);

    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  test("given a different entry, when getOrCompute is called, then it recomputes independently", () => {
    const { getOrCompute } = createEntryDerivedCache();
    const entryA = { id: 1 };
    const entryB = { id: 2 };
    const computeA = jest.fn(() => "a");
    const computeB = jest.fn(() => "b");

    expect(getOrCompute(entryA, "labels", computeA)).toBe("a");
    expect(getOrCompute(entryB, "labels", computeB)).toBe("b");
    expect(computeA).toHaveBeenCalledTimes(1);
    expect(computeB).toHaveBeenCalledTimes(1);
  });

  test("given the same entry but a different cache key, when getOrCompute is called, then it recomputes for the new key", () => {
    const { getOrCompute } = createEntryDerivedCache();
    const entry = { id: 1 };
    const computeLabels = jest.fn(() => ["bug"]);
    const computeAssignees = jest.fn(() => ["octocat"]);

    getOrCompute(entry, "labels", computeLabels);
    getOrCompute(entry, "assignedLogins", computeAssignees);

    expect(computeLabels).toHaveBeenCalledTimes(1);
    expect(computeAssignees).toHaveBeenCalledTimes(1);
  });

  test("given a filter-fingerprint-scoped cache key, when the fingerprint changes, then it recomputes instead of reusing the stale result", () => {
    const { getOrCompute } = createEntryDerivedCache();
    const entry = { id: 1 };
    const computeMatch = jest.fn(() => true);

    getOrCompute(entry, "filterMatch:fingerprint-1", computeMatch);
    getOrCompute(entry, "filterMatch:fingerprint-2", computeMatch);

    expect(computeMatch).toHaveBeenCalledTimes(2);
  });
});
