const {
  getSelectedPrNumbersFromInput,
  toggleSelectedPrNumber,
} = require("./pr-selected-pr-numbers.helpers.js");

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
});
