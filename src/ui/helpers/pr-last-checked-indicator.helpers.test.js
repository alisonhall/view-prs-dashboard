const {
  formatRelativeLastCheckedLabel,
  buildPrLastCheckedIndicator,
} = require("./pr-last-checked-indicator.helpers.js");

describe("pr last checked indicator helpers", () => {
  describe("formatRelativeLastCheckedLabel", () => {
    test("given no timestamp, when formatting, then it returns the unknown label", () => {
      expect(formatRelativeLastCheckedLabel(null).label).toBe("↻ unknown");
    });

    test("given a timestamp less than a minute old, when formatting, then it returns 'just now'", () => {
      const now = Date.parse("2026-01-01T00:00:30Z");
      const result = formatRelativeLastCheckedLabel("2026-01-01T00:00:00Z", now);
      expect(result.label).toBe("↻ just now");
    });

    test("given a timestamp 90 minutes old, when formatting, then it returns the hour-granularity label", () => {
      const now = Date.parse("2026-01-01T01:30:00Z");
      const result = formatRelativeLastCheckedLabel("2026-01-01T00:00:00Z", now);
      expect(result.label).toBe("↻ 1h ago");
    });

    test("given a timestamp 2 days old, when formatting, then it returns the day-granularity label", () => {
      const now = Date.parse("2026-01-03T00:00:00Z");
      const result = formatRelativeLastCheckedLabel("2026-01-01T00:00:00Z", now);
      expect(result.label).toBe("↻ 2d ago");
    });
  });

  describe("buildPrLastCheckedIndicator", () => {
    test("given an open section checked over 15 minutes ago, when building, then isStale is true", () => {
      const now = Date.parse("2026-01-01T00:20:00Z");
      jest.spyOn(Date, "now").mockReturnValue(now);
      const result = buildPrLastCheckedIndicator({
        updatedAt: "2026-01-01T00:00:00Z",
        sectionKey: "open",
      });
      expect(result.isStale).toBe(true);
      Date.now.mockRestore();
    });

    test("given an open section checked under 15 minutes ago, when building, then isStale is false", () => {
      const now = Date.parse("2026-01-01T00:10:00Z");
      jest.spyOn(Date, "now").mockReturnValue(now);
      const result = buildPrLastCheckedIndicator({
        updatedAt: "2026-01-01T00:00:00Z",
        sectionKey: "open",
      });
      expect(result.isStale).toBe(false);
      Date.now.mockRestore();
    });

    test("given a non-open section checked a long time ago, when building, then isStale is always false", () => {
      const now = Date.parse("2026-01-05T00:00:00Z");
      jest.spyOn(Date, "now").mockReturnValue(now);
      const result = buildPrLastCheckedIndicator({
        updatedAt: "2026-01-01T00:00:00Z",
        sectionKey: "merged",
      });
      expect(result.isStale).toBe(false);
      Date.now.mockRestore();
    });
  });
});
