const {
  describeApplyLabelTargets,
  getSelectedPrNumbersFromInput,
  toggleSelectedPrNumber,
} = require("./pr-selected-pr-numbers.helpers.ts");

describe("pr selected pr numbers helpers", () => {
  describe("getSelectedPrNumbersFromInput", () => {
    test("given a comma-separated string, when parsing, then it returns the numeric tokens", () => {
      expect(getSelectedPrNumbersFromInput("101,102, 103")).toEqual(["101", "102", "103"]);
    });

    test("given an empty/undefined input, when parsing, then it returns an empty array", () => {
      expect(getSelectedPrNumbersFromInput("")).toEqual([]);
      expect(getSelectedPrNumbersFromInput(undefined)).toEqual([]);
    });
  });

  describe("toggleSelectedPrNumber", () => {
    test("given a PR number not yet selected, when selecting it, then it's appended", () => {
      expect(toggleSelectedPrNumber("101,102", "103", true)).toBe("101,102,103");
    });

    test("given a PR number already selected, when selecting it again, then the list is unchanged", () => {
      expect(toggleSelectedPrNumber("101,102", "102", true)).toBe("101,102");
    });

    test("given a PR number currently selected, when deselecting it, then it's removed", () => {
      expect(toggleSelectedPrNumber("101,102,103", "102", false)).toBe("101,103");
    });

    test("given a PR number not currently selected, when deselecting it, then the list is unchanged", () => {
      expect(toggleSelectedPrNumber("101,102", "999", false)).toBe("101,102");
    });

    test("given an empty starting input, when selecting a PR number, then it becomes the sole entry", () => {
      expect(toggleSelectedPrNumber("", "101", true)).toBe("101");
    });

    test("given a non-numeric PR number, when toggling, then the input is returned unchanged", () => {
      expect(toggleSelectedPrNumber("101,102", "abc", true)).toBe("101,102");
    });
  });

  describe("describeApplyLabelTargets", () => {
    test("says which PRs Apply label will label, one or several, and how to pick some when there are none", () => {
      expect(describeApplyLabelTargets([])).toBe('No PRs to apply it to yet: tick rows in the table, or type their numbers in "PR number(s)" above.');
      expect(describeApplyLabelTargets(["912"])).toBe("Applies to 1 PR: #912.");
      expect(describeApplyLabelTargets(["912", "921"])).toBe("Applies to 2 PRs: #912, #921.");
    });

    test("lists the first 8, then how many more", () => {
      const numbers = Array.from({ length: 11 }, (_, i) => String(100 + i));
      expect(describeApplyLabelTargets(numbers)).toBe("Applies to 11 PRs: #100, #101, #102, #103, #104, #105, #106, #107 and 3 more.");
    });
  });
});
