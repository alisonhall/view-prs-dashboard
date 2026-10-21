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

  describe("getOrComputeLatest (bounded per-entry results for churning variants)", () => {
    test("given the same entry, key and variant, when called twice, then the compute function only runs once", () => {
      const { getOrComputeLatest } = createEntryDerivedCache();
      const entry = { id: 1 };
      const compute = jest.fn(() => true);

      getOrComputeLatest(entry, "filterMatch", "criteria-a", compute);
      getOrComputeLatest(entry, "filterMatch", "criteria-a", compute);

      expect(compute).toHaveBeenCalledTimes(1);
    });

    test("given a new variant, when called, then it recomputes and the previous variant's result is no longer retained", () => {
      const { getOrComputeLatest } = createEntryDerivedCache();
      const entry = { id: 1 };
      const compute = jest.fn(() => true);

      getOrComputeLatest(entry, "filterMatch", "criteria-a", compute);
      getOrComputeLatest(entry, "filterMatch", "criteria-b", compute);
      getOrComputeLatest(entry, "filterMatch", "criteria-a", compute);

      expect(compute).toHaveBeenCalledTimes(3);
    });

    test("given thousands of distinct variants on many entries, when called, then each entry holds one cached key, not one per variant (regression: renderer OOM, Chrome 'Error code: 5')", () => {
      // Entries keep the same object reference across renders while their
      // data is unchanged, so the cache's WeakMap never frees them - a
      // key-per-variant Map therefore grew by one result per keystroke
      // per loaded PR, forever.
      const { getOrComputeLatest, getCachedKeyCount } = createEntryDerivedCache();
      const entries = Array.from({ length: 50 }, (_, index) => ({ id: index }));

      for (let keystroke = 0; keystroke < 2000; keystroke += 1) {
        entries.forEach((entry) => getOrComputeLatest(entry, "filterMatch", `typed-${keystroke}`, () => true));
      }

      entries.forEach((entry) => expect(getCachedKeyCount(entry)).toBe(1));
    });

    test("given getOrCompute with the variant folded into the key (the old approach), when many variants are seen, then the entry's Map grows without bound - documenting why getOrComputeLatest exists", () => {
      const { getOrCompute, getCachedKeyCount } = createEntryDerivedCache();
      const entry = { id: 1 };

      for (let keystroke = 0; keystroke < 100; keystroke += 1) {
        getOrCompute(entry, `filterMatch:typed-${keystroke}`, () => true);
      }

      expect(getCachedKeyCount(entry)).toBe(100);
    });

    test("given an unrelated key on the same entry, when the latest-variant key churns, then the unrelated key is untouched", () => {
      const { getOrCompute, getOrComputeLatest, getCachedKeyCount } = createEntryDerivedCache();
      const entry = { id: 1 };
      const computeLabels = jest.fn(() => ["bug"]);

      getOrCompute(entry, "labelNames", computeLabels);
      for (let keystroke = 0; keystroke < 20; keystroke += 1) {
        getOrComputeLatest(entry, "filterMatch", `typed-${keystroke}`, () => true);
      }
      getOrCompute(entry, "labelNames", computeLabels);

      expect(computeLabels).toHaveBeenCalledTimes(1);
      expect(getCachedKeyCount(entry)).toBe(2);
    });
  });
});
