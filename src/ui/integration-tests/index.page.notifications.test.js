// Window-bridge elimination Phase 7.4: these used to come from index.page.js's
// __testables export, which re-exported its own wired instances. index.page.js
// no longer builds them, so the tests use the helpers directly, wired the
// way index.page.js wired them.
const { isTimeoutFailureMessage } = require("../helpers/pr-failure-snackbar.helpers.ts");
const { summarizeAckRefreshWarnings } = require("../helpers/pr-ack-refresh-warnings.helpers.ts");
const { createPrAutoRenderUnsavedHelpers } = require("../helpers/pr-auto-render-unsaved.helpers.ts");
const { createPrAutoRenderBlockingHelpers } = require("../helpers/pr-auto-render-blocking.helpers.ts");
const { createPrAuthorInsightsDraftsHelpers } = require("../helpers/pr-author-insights-drafts.helpers.ts");

const { formatBlockingPrKeysLabel } = createPrAutoRenderBlockingHelpers({
  normalizePrKey: createPrAutoRenderUnsavedHelpers().normalizePrKey,
});
const {
  normalizeAuthorInsightsSentiment,
  isAuthorInsightsComposerDraftDirty,
  isAuthorInsightsEditDraftDirty,
} = createPrAuthorInsightsDraftsHelpers();

describe("ui notification helpers", () => {
  describe("isTimeoutFailureMessage", () => {
    test.each([
      ["script timeout wording", "Script timed out after 120s", true],
      ["deadline wording", "deadline exceeded while refreshing", true],
      ["unrelated error", "HTTP 500 failed", false],
      ["empty string", "", false],
    ])("returns %s detection for %s", (_label, message, expected) => {
      expect(isTimeoutFailureMessage(message)).toBe(expected);
    });
  });

  describe("summarizeAckRefreshWarnings", () => {
    test("separates skipped and failed entries", () => {
      const warningSummary = summarizeAckRefreshWarnings([
        {
          prNumber: "101",
          error: "Skipped: total ack refresh budget exceeded after 480s",
        },
        {
          prNumber: "102",
          error: "Refresh failed: gh returned 502",
        },
      ]);

      expect(warningSummary).toEqual({
        skippedCount: 1,
        failedCount: 1,
        summaryText: "1 skipped, 1 failed",
        sample:
          "#101: Skipped: total ack refresh budget exceeded after 480s\n#102: Refresh failed: gh returned 502",
      });
    });

    test("returns null when there are no errors", () => {
      expect(summarizeAckRefreshWarnings([])).toBeNull();
    });

    test("returns null for missing or non-array input", () => {
      expect(summarizeAckRefreshWarnings(null)).toBeNull();
      expect(summarizeAckRefreshWarnings(undefined)).toBeNull();
    });

    test("respects sample size limit", () => {
      const sampledSummary = summarizeAckRefreshWarnings(
        [
          { prNumber: "1", error: "Skipped: budget" },
          { prNumber: "2", error: "Skipped: budget" },
          { prNumber: "3", error: "Skipped: budget" },
        ],
        2,
      );

      expect(sampledSummary).toEqual({
        skippedCount: 3,
        failedCount: 0,
        summaryText: "3 skipped",
        sample: "#1: Skipped: budget\n#2: Skipped: budget",
      });
    });
  });

  describe("formatBlockingPrKeysLabel", () => {
    test("returns empty text when there are no valid PR keys", () => {
      expect(formatBlockingPrKeysLabel([])).toBe("");
      expect(formatBlockingPrKeysLabel(["", "abc", null, "12"])).toBe("");
    });

    test("deduplicates and sorts PR keys by repo, then number", () => {
      expect(formatBlockingPrKeysLabel(["acme/web#20", "acme/web#5", "acme/web#20", "acme/api#11"])).toBe(
        "Blocking PRs: acme/api#11, acme/web#5, acme/web#20",
      );
    });

    test("applies visible-limit suffix when list is long", () => {
      expect(
        formatBlockingPrKeysLabel(["a/b#1", "a/b#2", "a/b#3", "a/b#4", "a/b#5"], 3),
      ).toBe("Blocking PRs: a/b#1, a/b#2, a/b#3 (+2 more)");
    });
  });

  describe("author insights draft helpers", () => {
    test("normalizeAuthorInsightsSentiment coerces to supported values", () => {
      expect(normalizeAuthorInsightsSentiment("positive")).toBe("positive");
      expect(normalizeAuthorInsightsSentiment(" NEGATIVE ")).toBe("negative");
      expect(normalizeAuthorInsightsSentiment("unknown")).toBe("neutral");
      expect(normalizeAuthorInsightsSentiment("")).toBe("neutral");
    });

    test("isAuthorInsightsComposerDraftDirty tracks note or sentiment divergence", () => {
      expect(
        isAuthorInsightsComposerDraftDirty({
          note: "",
          sentiment: "neutral",
        }),
      ).toBe(false);

      expect(
        isAuthorInsightsComposerDraftDirty({
          note: "Needs follow-up",
          sentiment: "neutral",
        }),
      ).toBe(true);

      expect(
        isAuthorInsightsComposerDraftDirty({
          note: "",
          sentiment: "positive",
        }),
      ).toBe(true);
    });

    test("isAuthorInsightsEditDraftDirty compares draft values against saved comment", () => {
      const savedComment = {
        note: "Original note",
        sentiment: "neutral",
      };

      expect(
        isAuthorInsightsEditDraftDirty(savedComment, {
          note: "Original note",
          sentiment: "neutral",
        }),
      ).toBe(false);

      expect(
        isAuthorInsightsEditDraftDirty(savedComment, {
          note: "Updated note",
          sentiment: "neutral",
        }),
      ).toBe(true);

      expect(
        isAuthorInsightsEditDraftDirty(savedComment, {
          note: "Original note",
          sentiment: "positive",
        }),
      ).toBe(true);
    });
  });
});
