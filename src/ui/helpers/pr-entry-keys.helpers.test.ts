import { buildPrEntryKey, findPrEntriesByNumber, findPrEntry } from "./pr-entry-keys.helpers.ts";

describe("PR entry keys: repo#number, so two repos' PRs with the same number are two rows", () => {
  const rows = {
    "acme/api#12": { repo: "acme/api", prNumber: "12", data: { title: "API" } },
    // A row from before, keyed by its bare number.
    12: { repo: "acme/web", prNumber: "12", data: { title: "Web" } },
    "acme/api#13": { repo: "acme/api", prNumber: "13", data: { title: "Thirteen" } },
  };

  test("buildPrEntryKey", () => {
    expect(buildPrEntryKey("acme/api", 12)).toBe("acme/api#12");
  });

  test("findPrEntry looks a row up by repo and number, under either key", () => {
    expect(findPrEntry(rows, "acme/api", "12")?.data?.title).toBe("API");
    expect(findPrEntry(rows, "acme/web", 12)?.data?.title).toBe("Web");
    expect(findPrEntry(rows, "other/repo", "12")).toBeUndefined();
    expect(findPrEntry(rows, "acme/api", "99")).toBeUndefined();
    expect(findPrEntry(null, "acme/api", "12")).toBeUndefined();
  });

  test("findPrEntriesByNumber gives every repo's row with that number", () => {
    expect(findPrEntriesByNumber(rows, "12").map((entry) => entry.data?.title).sort()).toEqual(["API", "Web"]);
    expect(findPrEntriesByNumber(rows, "99")).toEqual([]);
  });
});
