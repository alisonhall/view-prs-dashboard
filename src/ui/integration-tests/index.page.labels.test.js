const { __testables } = require("../index.page.js");

const { resolveRepoForLabelsFetch, shouldRefetchLabelsForRepo } = __testables;

describe("ui label-fetch helpers", () => {
  describe("resolveRepoForLabelsFetch", () => {
    // Regression guard for a real bug: this used to fall back to
    // DEFAULT_REPO (a placeholder/example value, not a repo guaranteed to
    // exist or be visible to the signed-in GitHub account) whenever no
    // repo was known yet, which produced a real 500 from `gh label list`
    // on page load before the actual configured repo had been restored.
    test("given no repoOverride, currentRepo, or repoInputValue, when resolving, then returns an empty string (never a hardcoded default)", () => {
      expect(
        resolveRepoForLabelsFetch({
          repoOverride: "",
          currentRepo: "",
          repoInputValue: "",
        }),
      ).toBe("");
      expect(resolveRepoForLabelsFetch()).toBe("");
      expect(resolveRepoForLabelsFetch({})).toBe("");
    });

    test("given a repoOverride, when resolving, then it takes priority over currentRepo and repoInputValue", () => {
      expect(
        resolveRepoForLabelsFetch({
          repoOverride: "owner/override",
          currentRepo: "owner/current",
          repoInputValue: "owner/input",
        }),
      ).toBe("owner/override");
    });

    test("given no repoOverride but a currentRepo, when resolving, then it takes priority over repoInputValue", () => {
      expect(
        resolveRepoForLabelsFetch({
          repoOverride: "",
          currentRepo: "owner/current",
          repoInputValue: "owner/input",
        }),
      ).toBe("owner/current");
    });

    test("given only a repoInputValue, when resolving, then it is used as the last-resort source", () => {
      expect(
        resolveRepoForLabelsFetch({
          repoOverride: "",
          currentRepo: "",
          repoInputValue: "owner/input",
        }),
      ).toBe("owner/input");
    });

    test("given surrounding whitespace, when resolving, then the result is trimmed", () => {
      expect(
        resolveRepoForLabelsFetch({
          repoOverride: "  owner/repo  ",
          currentRepo: "",
          repoInputValue: "",
        }),
      ).toBe("owner/repo");
    });
  });

  describe("shouldRefetchLabelsForRepo", () => {
    test("given an empty repo, when checking, then returns false regardless of lastFetchedRepo", () => {
      expect(shouldRefetchLabelsForRepo({ repo: "", lastFetchedRepo: "" })).toBe(false);
      expect(shouldRefetchLabelsForRepo({ repo: "", lastFetchedRepo: "owner/repo" })).toBe(false);
    });

    test("given a repo matching lastFetchedRepo, when checking, then returns false (avoids redundant refetches)", () => {
      expect(
        shouldRefetchLabelsForRepo({ repo: "owner/repo", lastFetchedRepo: "owner/repo" }),
      ).toBe(false);
    });

    test("given a repo that differs from lastFetchedRepo, when checking, then returns true", () => {
      expect(
        shouldRefetchLabelsForRepo({ repo: "owner/repo-b", lastFetchedRepo: "owner/repo-a" }),
      ).toBe(true);
    });

    test("given a repo and no prior lastFetchedRepo, when checking, then returns true", () => {
      expect(shouldRefetchLabelsForRepo({ repo: "owner/repo", lastFetchedRepo: "" })).toBe(true);
    });

    test("given no arguments, when checking, then returns false", () => {
      expect(shouldRefetchLabelsForRepo()).toBe(false);
      expect(shouldRefetchLabelsForRepo({})).toBe(false);
    });
  });
});
