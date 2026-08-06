const {
  computeViewPrsRowVersion,
  buildViewPrsDataManifest,
  buildGitDiffOnlyMergedEntry,
} = require("../helpers/view-prs-data-helpers.js");

describe("view-prs data helper manifest functions", () => {
  test("computeViewPrsRowVersion changes when visible row content changes", () => {
    const baseEntry = {
      repo: "owner/repo",
      section: "open",
      updatedAt: "2026-06-01T10:00:00Z",
      notes: { otherNotes: "keep an eye on this" },
      data: { labels: ["frontend"], status: "NO_CHANGE" },
    };

    const unchangedVersion = computeViewPrsRowVersion(baseEntry, "101");
    const changedVersion = computeViewPrsRowVersion(
      {
        ...baseEntry,
        data: { ...baseEntry.data, labels: ["frontend", "api"] },
      },
      "101",
    );

    expect(unchangedVersion).not.toBe(changedVersion);
  });

  test("computeViewPrsRowVersion handles empty inputs predictably", () => {
    expect(typeof computeViewPrsRowVersion(null, null)).toBe("string");
    expect(computeViewPrsRowVersion(null, null)).toContain('"prNumber":""');
  });

  test("buildViewPrsDataManifest sorts PR numbers and preserves manifest metadata", () => {
    const manifest = buildViewPrsDataManifest({
      byPrNumber: {
        200: {
          repo: "owner/repo",
          section: "merged",
          updatedAt: "2026-06-01T12:00:00Z",
        },
        15: {
          repo: "owner/repo",
          section: "open",
          updatedAt: "2026-06-01T11:00:00Z",
        },
      },
    });

    expect(Object.keys(manifest)).toEqual(["15", "200"]);
    expect(manifest["15"]).toEqual(
      expect.objectContaining({
        repo: "owner/repo",
        section: "open",
        updatedAt: "2026-06-01T11:00:00Z",
      }),
    );
    expect(typeof manifest["15"].rowVersion).toBe("string");
  });

  test("buildViewPrsDataManifest returns an empty object for invalid data", () => {
    expect(buildViewPrsDataManifest(null)).toEqual({});
    expect(buildViewPrsDataManifest({ byPrNumber: [] })).toEqual({});
  });

  test("given a cached diff-only PR, when building a synthetic row, then it produces a Git Diff only merged entry", () => {
    const row = buildGitDiffOnlyMergedEntry(
      "owner/repo",
      "123",
      "owner/repo",
      "2026-06-29T10:00:00Z",
    );

    expect(row).toMatchObject({
      prNumber: "123",
      repo: "owner/repo",
      section: "merged",
      updatedAt: "2026-06-29T10:00:00Z",
      data: {
        number: "123",
        title: "Git Diff only",
        titleDisplay: "Git Diff only",
        status: "NO_LOCAL_DATA",
        sourceUpdatedAt: "2026-06-29T10:00:00Z",
      },
    });
  });
});
