const { createPrJsonModalHelpers } = require("./pr-json-modal.helpers.js");

const makeSummarizeDiffText = () => (diffText) => {
  const lines = String(diffText || "").split(/\r?\n/);
  const summary = { filesChanged: 0, hunks: 0, additions: 0, deletions: 0, lines: lines.length };
  lines.forEach((line) => {
    if (line.startsWith("diff --git ")) summary.filesChanged += 1;
    if (line.startsWith("@@")) summary.hunks += 1;
    if (line.startsWith("+") && !line.startsWith("+++")) summary.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) summary.deletions += 1;
  });
  return summary;
};

describe("pr json modal helpers", () => {
  const { formatDiffSummaryLine, buildPrJsonModalAiClipboardText } =
    createPrJsonModalHelpers({ summarizeDiffText: makeSummarizeDiffText() });

  test("formatDiffSummaryLine includes file, hunk, and line stats for a normal diff", () => {
    const summary = formatDiffSummaryLine({
      ok: true,
      source: "cache",
      stale: false,
      fetchedAt: "2026-05-27T11:22:33Z",
      diffText: [
        "diff --git a/src/a.js b/src/a.js",
        "@@ -1 +1 @@",
        "-old line",
        "+new line",
      ].join("\n"),
    });

    expect(summary).toContain("1 files");
    expect(summary).toContain("+1/-1");
    expect(summary).toContain("1 hunks");
    expect(summary).toContain("cache");
    expect(summary).toContain("current");
  });

  test("formatDiffSummaryLine includes stale-cache freshness context when diff is stale", () => {
    const summary = formatDiffSummaryLine({
      ok: true,
      source: "stale-cache",
      stale: true,
      fetchedAt: "2026-05-27T11:22:33Z",
      diffText: [
        "diff --git a/file.ts b/file.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
      ].join("\n"),
    });

    expect(summary).toContain("stale-cache");
    expect(summary).toContain("stale cache");
    expect(summary).toContain("1 files");
  });

  test("formatDiffSummaryLine returns an error string when diff data is unavailable", () => {
    const summary = formatDiffSummaryLine({ ok: false, error: "diff fetch failed" });
    expect(summary).toBe("diff fetch failed");
  });

  test("formatDiffSummaryLine returns a fallback message when diffData is null", () => {
    const summary = formatDiffSummaryLine(null);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  test("buildPrJsonModalAiClipboardText builds a combined AI-friendly payload with all labeled sections", () => {
    const detailsPayload = {
      repo: "owner/repo",
      prNumber: "1234",
      dataFile: {
        file: "check-open-pr-updates.data.json",
        entry: { repo: "owner/repo", prNumber: "1234", data: { title: "Add modal copy-all" } },
      },
      prDetailFile: {
        file: "data/pr-details/owner_repo__pr-1234.json",
        entry: {
          activityTimeline: [{ date: "2026-05-27", actor: "reviewer" }],
          reviewThreads: [{ id: "thread-1" }],
        },
      },
      userStateFile: {
        file: "check-open-pr-updates.user-state.json",
        entry: { notesByPrNumber: { otherNotes: "Looks good" } },
      },
    };

    const diffData = {
      ok: true,
      file: "data/pr-diffs/owner_repo__pr-1234.json",
      source: "cache",
      stale: false,
      warning: "",
      commitFingerprint: "abc123",
      fetchedAt: "2026-05-27T11:00:00Z",
      filePath: "/tmp/owner_repo__pr-1234.json",
      diffText: "diff --git a/a.txt b/a.txt\n+added line\n-removed line",
    };

    const output = buildPrJsonModalAiClipboardText(detailsPayload, diffData);

    expect(output).toContain("PR JSON Details for AI Review");
    expect(output).toContain("Repo: owner/repo");
    expect(output).toContain("PR Number: 1234");
    expect(output).toContain("Data File Entry (check-open-pr-updates.data.json)");
    expect(output).toContain("PR Detail File (data/pr-details/owner_repo__pr-1234.json)");
    expect(output).toContain("User State Entry (check-open-pr-updates.user-state.json)");
    expect(output).toContain("PR Diff Metadata (data/pr-diffs/owner_repo__pr-1234.json)");
    expect(output).toContain("PR Diff Text");
    expect(output).toContain("```json");
    expect(output).toContain("```diff");
  });

  test("buildPrJsonModalAiClipboardText uses fallback labels and empty-safe structure when inputs are null", () => {
    const output = buildPrJsonModalAiClipboardText(null, null);

    expect(output).toContain("PR JSON Details for AI Review");
    expect(output).toContain("Repo: unknown");
    expect(output).toContain("PR Number: unknown");
    expect(output).toContain("```json");
    expect(output).toContain("```diff");
  });

  test("buildPrJsonModalAiClipboardText includes diff text inline in the output", () => {
    const diffData = {
      ok: true,
      file: "data/pr-diffs/test.json",
      source: "cache",
      stale: false,
      diffText: "diff --git a/src.js b/src.js\n+console.log('hello');",
    };

    const output = buildPrJsonModalAiClipboardText(
      { repo: "owner/repo", prNumber: "55" },
      diffData,
    );

    expect(output).toContain("+console.log('hello');");
  });
});
