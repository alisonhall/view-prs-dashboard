import {
  describeActivity,
  describeChecks,
  describeMergeable,
  describeNotes,
  describeSize,
  describeViewedFiles,
  formatShortAge,
} from "./pr-row-signals.helpers.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");

describe("pr row signals helpers", () => {
  describe("describeChecks", () => {
    test("maps each check state to its icon, tone and tooltip", () => {
      expect(describeChecks({ checkState: "PASS" })).toMatchObject({ icon: "checksPass", tone: "success", label: "Checks: PASS\nAll checks passed" });
      expect(describeChecks({ checkState: "FAIL" })).toMatchObject({ icon: "checksFail", tone: "danger" });
      expect(describeChecks({ checkState: "RUN" })).toMatchObject({ icon: "checksPending", tone: "pending" });
      expect(describeChecks({ checkState: "SKIP" })).toMatchObject({ icon: "checksSkipped", tone: "muted" });
    });

    test("leaves the slot empty for no checks or no data", () => {
      expect(describeChecks({ checkState: "NA" })).toBeNull();
      expect(describeChecks({})).toBeNull();
    });

    test("falls back to the [CHK:...] marker in titleDisplay for older data", () => {
      expect(describeChecks({ titleDisplay: "Fix it [CHK:FAIL][MRG:YES]" })).toMatchObject({ icon: "checksFail" });
    });
  });

  describe("describeMergeable", () => {
    test("explains YES / NO / UNK", () => {
      expect(describeMergeable({ mergeState: "YES" })).toEqual({ icon: "merge", tone: "success", label: "Mergeable: YES\nNo conflicts" });
      expect(describeMergeable({ mergeState: "NO" })).toEqual({ icon: "mergeConflict", tone: "attention", label: "Mergeable: NO\nHas conflicts" });
      expect(describeMergeable({ mergeState: "UNK" })).toEqual({
        icon: "mergeUnknown",
        tone: "muted",
        label: "Mergeable: UNK\nGitHub hasn't computed it yet",
      });
    });

    test("shows any other GitHub value as it is, and nothing without data", () => {
      expect(describeMergeable({ mergeState: "BLOCKED" })).toEqual({ icon: "mergeUnknown", tone: "muted", label: "Mergeable: BLOCKED" });
      expect(describeMergeable({ titleDisplay: "Fix it [CHK:PASS][MRG:NO]" })).toMatchObject({ icon: "mergeConflict" });
      expect(describeMergeable({})).toBeNull();
    });
  });

  describe("describeViewedFiles", () => {
    test("shows viewed of changed, green once all are viewed", () => {
      expect(describeViewedFiles({ viewedFilesCount: "1", changedFilesCount: "4" })).toEqual({
        text: "1/4",
        tone: "muted",
        label: "Viewed files: 1 of 4",
      });
      expect(describeViewedFiles({ viewedFilesCount: 3, changedFilesCount: 3 })).toEqual({
        text: "3/3",
        tone: "success",
        label: "Viewed files: all 3",
      });
    });

    test("is empty when no changed files are recorded", () => {
      expect(describeViewedFiles({})).toBeNull();
    });
  });

  describe("describeNotes", () => {
    test("lists the note fields that have content", () => {
      const entry = {
        notes: {
          comments: [{ author: "me", note: "Good" }, { author: "me", note: "Split it" }],
          otherNotes: "Check on mobile",
          prDifficulty: "3",
          stories: [{ name: "US1001", url: "" }],
          analysisOfPr: "Low risk",
        },
      };
      expect(describeNotes(entry, {})).toBe("Notes: 2 comments · other notes · difficulty 3 · stories · analysis of PR");
    });

    test("is empty when there are no notes", () => {
      expect(describeNotes({}, {})).toBeNull();
      expect(describeNotes({ notes: { comments: [], otherNotes: "  " } }, {})).toBeNull();
    });
  });

  describe("describeSize", () => {
    test("shows additions and deletions, with the files count in the tooltip", () => {
      expect(describeSize({ additions: "38", deletions: "12", changedFilesCount: "3" })).toEqual({
        additions: "+38",
        deletions: "−12",
        label: "3 files changed\n+38 additions, −12 deletions",
      });
      expect(describeSize({ additions: 2, deletions: 0, changedFilesCount: 1 })?.label).toBe("1 file changed\n+2 additions, −0 deletions");
    });

    test("is empty when no line counts are recorded", () => {
      expect(describeSize({})).toBeNull();
    });
  });

  describe("formatShortAge", () => {
    test("gives now / minutes / hours / days, and nothing for a missing time", () => {
      expect(formatShortAge("2026-10-24T11:59:40Z", NOW)).toBe("now");
      expect(formatShortAge("2026-10-24T11:55:00Z", NOW)).toBe("5m");
      expect(formatShortAge("2026-10-24T09:00:00Z", NOW)).toBe("3h");
      expect(formatShortAge("2026-10-12T12:00:00Z", NOW)).toBe("12d");
      expect(formatShortAge("", NOW)).toBe("");
      expect(formatShortAge("-", NOW)).toBe("");
      expect(formatShortAge("not a date", NOW)).toBe("");
    });
  });

  describe("describeActivity", () => {
    test("uses merged, else closed, else last commit, and includes the viewer's last activity", () => {
      const merged = describeActivity({ mergedAt: "2026-10-22T12:00:00Z", sourceUpdatedAt: "2026-10-21T12:00:00Z", baseline: "2026-10-20T12:00:00Z" }, NOW);
      expect(merged.text).toBe("2d");
      expect(merged.label).toMatch(/^Merged: .+\nYour last activity: .+/);
      expect(describeActivity({ closedAt: "2026-10-24T11:00:00Z" }, NOW).label).toMatch(/^Closed: /);
      expect(describeActivity({ sourceUpdatedAt: "2026-10-24T11:00:00Z", baseline: "-" }, NOW)).toEqual({
        text: "1h",
        label: expect.stringMatching(/^Last commit: .+\nYour last activity: –$/),
      });
    });

    test("shows a dash when there's no activity time", () => {
      expect(describeActivity({}, NOW)).toEqual({ text: "–", label: "Last commit: –\nYour last activity: –" });
    });
  });
});
