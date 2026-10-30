import {
  formatCompactCount,
  describeActivity,
  describeChecks,
  describeMergeable,
  describeNotes,
  describeSize,
  describeViewedFiles,
  findLastActivityAt,
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

    test("shortens large counts for the column, keeping the exact ones in the tooltip", () => {
      expect(describeSize({ additions: 9999, deletions: 12345, changedFilesCount: 40 })).toEqual({
        additions: "+9999",
        deletions: "−12k",
        label: "40 files changed\n+9999 additions, −12345 deletions",
      });
    });
  });

  describe("formatCompactCount", () => {
    test("is exact below 10,000, then whole thousands, then millions to one place", () => {
      expect(formatCompactCount(0)).toBe("0");
      expect(formatCompactCount(9999)).toBe("9999");
      expect(formatCompactCount(10_000)).toBe("10k");
      expect(formatCompactCount(123_456)).toBe("123k");
      expect(formatCompactCount(999_499)).toBe("999k");
      expect(formatCompactCount(999_500)).toBe("1M");
      expect(formatCompactCount(1_250_000)).toBe("1.3M");
    });

    test("never needs more than 4 characters (5 with the sign) below 100 million", () => {
      [9999, 10_000, 99_999, 999_499, 999_500, 9_949_999, 99_000_000].forEach((count) =>
        expect(formatCompactCount(count).length).toBeLessThanOrEqual(4),
      );
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
    test("gives the author's and your last activity, with any merge or close in the tooltip", () => {
      const merged = describeActivity({ mergedAt: "2026-10-22T12:00:00Z", baseline: "2026-10-20T12:00:00Z" }, NOW, "2026-10-23T12:00:00Z");
      expect(merged).toMatchObject({ authorText: "1d", viewerText: "4d" });
      expect(merged.label).toMatch(/^Author's last activity: .+\nYour last activity: .+\nMerged: .+$/);
      expect(describeActivity({ closedAt: "2026-10-24T11:00:00Z" }, NOW).label).toMatch(/\nClosed: .+$/);
    });

    test("leaves your line out when you have no activity, and shows a dash for the author's when they have none", () => {
      expect(describeActivity({ baseline: "-" }, NOW, "2026-10-24T11:00:00Z")).toEqual({
        authorText: "1h",
        viewerText: "",
        label: expect.stringMatching(/^Author's last activity: .+\nYour last activity: –$/),
      });
      expect(describeActivity({}, NOW)).toEqual({
        authorText: "–",
        viewerText: "",
        label: "Author's last activity: –\nYour last activity: –",
      });
    });
  });

  describe("findLastActivityAt", () => {
    const normalize = (login: unknown) => ({ "old-login": "alice" } as Record<string, string>)[String(login)] ?? String(login || "").toLowerCase();

    test("finds the person's latest event, through their aliases", () => {
      const events = [
        { actor: "alice", occurredAt: "2026-10-20T10:00:00Z" },
        { actor: "bob", occurredAt: "2026-10-23T10:00:00Z" },
        { actor: "old-login", occurredAt: "2026-10-22T10:00:00Z" },
        { actor: "Alice", occurredAt: "not a date" },
      ];
      expect(findLastActivityAt(events, "ALICE", normalize)).toBe("2026-10-22T10:00:00Z");
    });

    test("gives nothing without a login or without their events", () => {
      expect(findLastActivityAt([{ actor: "bob", occurredAt: "2026-10-23T10:00:00Z" }], "alice", normalize)).toBe("");
      expect(findLastActivityAt([{ actor: "", occurredAt: "2026-10-23T10:00:00Z" }], "", normalize)).toBe("");
    });
  });
});
