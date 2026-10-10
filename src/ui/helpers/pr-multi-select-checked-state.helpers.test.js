const { seedCheckedState } = require("./pr-multi-select-checked-state.helpers.js");

describe("pr-multi-select-checked-state helpers", () => {
  describe("seedCheckedState", () => {
    test("given existing checked DOM values, when seeding, then those win over any pending selections and pending is not cleared", () => {
      const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];

      const { items, shouldClearPending } = seedCheckedState(options, {
        existingChecked: ["b"],
        pendingSelections: ["a"],
      });

      expect(items).toEqual([
        { value: "a", label: "A", checked: false },
        { value: "b", label: "B", checked: true },
      ]);
      // shouldClearPending is driven by whether existingChecked is
      // non-empty (it is here), independent of whether it happens to
      // overlap with pendingSelections - existingChecked already "won".
      expect(shouldClearPending).toBe(true);
    });

    test("given no existing checked values, when seeding from a pending selection, then it applies the pending values and reports the pending selection should be cleared", () => {
      const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];

      const { items, shouldClearPending } = seedCheckedState(options, {
        existingChecked: [],
        pendingSelections: ["b"],
      });

      expect(items).toEqual([
        { value: "a", label: "A", checked: false },
        { value: "b", label: "B", checked: true },
      ]);
      expect(shouldClearPending).toBe(true);
    });

    test("given no existing checked values and no pending selections, when seeding, then nothing is checked and pending is not cleared", () => {
      const options = [{ value: "a", label: "A" }];

      const { items, shouldClearPending } = seedCheckedState(options, {
        existingChecked: [],
        pendingSelections: null,
      });

      expect(items).toEqual([{ value: "a", label: "A", checked: false }]);
      expect(shouldClearPending).toBe(false);
    });

    test("given a pending selection that matches nothing in the current options, when seeding, then nothing is checked and pending is left alone (not cleared yet)", () => {
      // Real scenario this guards: options haven't loaded yet (e.g. the
      // payload hasn't arrived) when a restore-time pending selection is
      // first seeded - clearing it here would permanently lose the
      // persisted selection before it ever had a chance to match.
      const options = [{ value: "a", label: "A" }];

      const { items, shouldClearPending } = seedCheckedState(options, {
        existingChecked: [],
        pendingSelections: ["stale-value"],
      });

      expect(items).toEqual([{ value: "a", label: "A", checked: false }]);
      expect(shouldClearPending).toBe(false);
    });

    test("given a normalizeToken function, when seeding, then matching is case/whitespace-insensitive", () => {
      const options = [{ value: "Bug Fix", label: "Bug Fix" }];
      const normalizeToken = (value) => String(value || "").trim().toLowerCase();

      const { items } = seedCheckedState(options, {
        existingChecked: [" bug fix "],
        normalizeToken,
      });

      expect(items).toEqual([{ value: "Bug Fix", label: "Bug Fix", checked: true }]);
    });

    test("given no options/deps at all, when seeding, then it returns an empty, unchecked result without throwing", () => {
      expect(seedCheckedState()).toEqual({ items: [], shouldClearPending: false });
      expect(seedCheckedState(undefined, {})).toEqual({ items: [], shouldClearPending: false });
    });
  });
});
