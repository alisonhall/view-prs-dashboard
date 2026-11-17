const {
  buildPrEntryKey,
  isLegacyPrEntryKey,
  prNumberFromKey,
  normalizePrEntryKeys,
  findPrEntry,
  findPrEntryKey,
  migrateNotesKeys,
} = require("./view-prs-pr-keys");

describe("PR keys: repo#number, so two repos' PRs with the same number are two PRs", () => {
  const row = (repo, title) => ({ repo, prNumber: "12", data: { number: "12", title } });

  test("builds and reads keys", () => {
    expect(buildPrEntryKey("acme/api", 12)).toBe("acme/api#12");
    expect(isLegacyPrEntryKey("12")).toBe(true);
    expect(isLegacyPrEntryKey("acme/api#12")).toBe(false);
    expect(prNumberFromKey("acme/api#12")).toBe("12");
    expect(prNumberFromKey("12")).toBe("12");
  });

  test("normalizePrEntryKeys moves bare-number rows to their repo's key; an existing repo key wins, and a row without a repo keeps its number", () => {
    expect(
      normalizePrEntryKeys({
        12: row("acme/api", "old"),
        "acme/api#12": row("acme/api", "new"),
        13: row("acme/web", "web"),
        14: { prNumber: "14", data: {} },
      }),
    ).toEqual({
      "acme/api#12": row("acme/api", "new"),
      "acme/web#13": row("acme/web", "web"),
      14: { prNumber: "14", data: {} },
    });
  });

  test("findPrEntry and findPrEntryKey look a row up by repo and number, either key", () => {
    const rows = { "acme/api#12": row("acme/api", "api"), 12: row("acme/web", "web, not migrated") };
    expect(findPrEntry(rows, "acme/api", "12").data.title).toBe("api");
    expect(findPrEntry(rows, "acme/web", "12").data.title).toBe("web, not migrated");
    expect(findPrEntry(rows, "other/repo", "12")).toBeUndefined();
    expect(findPrEntryKey(rows, "acme/web", "12")).toBe("12");
    // Not stored: the key it would get.
    expect(findPrEntryKey(rows, "other/repo", "12")).toBe("other/repo#12");
  });

  test("migrateNotesKeys gives bare-number notes their PR's repo key", () => {
    const rows = {
      "acme/api#12": row("acme/api", "api"),
      "acme/web#12": row("acme/web", "web"),
      "acme/web#20": { repo: "acme/web", prNumber: "20" },
    };
    expect(
      migrateNotesKeys(
        {
          // Two repos have a #12: which PR these were for can't be told - the
          // last run's repo, as the page showed them there.
          12: { otherNotes: "twelve" },
          // One repo has a #20.
          20: { otherNotes: "twenty" },
          // No row: the last run's repo.
          30: { otherNotes: "thirty" },
          // Already keyed: kept, and wins over a bare one for the same PR.
          "acme/web#20": { otherNotes: "newer twenty" },
        },
        rows,
        "acme/api",
      ),
    ).toEqual({
      "acme/api#12": { otherNotes: "twelve" },
      "acme/web#20": { otherNotes: "newer twenty" },
      "acme/api#30": { otherNotes: "thirty" },
    });
  });

  test("migrateNotesKeys returns the same object when nothing needs moving", () => {
    const notes = { "acme/api#12": { otherNotes: "x" } };
    expect(migrateNotesKeys(notes, {}, "acme/api")).toBe(notes);
  });
});
