/**
 * Author Insights Display Helpers Contract Tests
 * 
 * Validates that display and formatting helpers work correctly.
 *
 * @jest-environment jsdom
 */

const {
  createPrAuthorInsightsDisplayHelpers,
} = require("./pr-author-insights-display.helpers.js");
const { createPrRowEntry } = require("../test-fixtures/pr-row.fixtures.js");

describe("pr author insights display helpers", () => {
  const createDependencies = (overrides = {}) => ({
    resolveActorDisplayName: (login, map, fallback) => map[login] || fallback || login,
    getPreferredActorKey: (login, name) => login || name,
    normalizeActorLogin: (login) => String(login || "").toLowerCase().trim(),
    normalizeAuthorInsightsSentiment: (value) => {
      const sentiment = String(value || "").toLowerCase().trim();
      if (sentiment === "positive") return "positive";
      if (sentiment === "negative") return "negative";
      return "neutral";
    },
    isChangedStatus: (status) => status === "CHANGED",
    toCount: (value) => Number(value || 0),
    parseMarkerState: (text, marker) => {
      if (text?.includes(`[${marker}:PASS]`)) return "PASS";
      if (text?.includes(`[${marker}:FAIL]`)) return "FAIL";
      return "-";
    },
    formatChkDisplay: (state, failureCount) =>
      state === "FAIL" ? `${state} (${failureCount || 0})` : state,
    getOpenConversationCount: (row) => Number(row?.conversations || 0),
    getViewedFilesSummary: (row) => `${row?.viewedFiles || 0}/${row?.totalFiles || 0} viewed`,
    asArray: (value) => (Array.isArray(value) ? value : []),
    parseSortableTime: (value) => {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? date.getTime() : 0;
    },
    formatIsoDatetime: (value) => String(value || "-"),
    ...overrides,
  });

  describe("buildAuthorInsightsEntries", () => {
    test("given rows with authors, when building entries, then sorted author list returned", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const rows = [
        createPrRowEntry({
          data: { authorLogin: "user1", author: "User One" },
        }),
        createPrRowEntry({
          data: { authorLogin: "user2", author: "User Two" },
        }),
      ];
      const actorsMap = { user1: "User One", user2: "User Two" };

      const entries = helpers.buildAuthorInsightsEntries(rows, actorsMap);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ login: "user1", name: "User One" });
      expect(entries[1]).toEqual({ login: "user2", name: "User Two" });
    });

    test("given empty rows, when building entries, then actors map entries returned", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const actorsMap = { user3: "User Three" };

      const entries = helpers.buildAuthorInsightsEntries([], actorsMap);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ login: "user3", name: "User Three" });
    });

    test("given duplicate authors, when building entries, then deduplicated list returned", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const rows = [
        createPrRowEntry({ data: { authorLogin: "user1", author: "User One" } }),
        createPrRowEntry({ data: { authorLogin: "user1", author: "User One" } }),
      ];

      const entries = helpers.buildAuthorInsightsEntries(rows, {});

      expect(entries).toHaveLength(1);
    });
  });

  describe("noteAuthorMatchesSelection", () => {
    test("given matching login, when checking match, then returns true", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const selectedAuthor = { login: "user1", name: "User One" };

      const matches = helpers.noteAuthorMatchesSelection(
        "user1",
        selectedAuthor,
        {},
      );

      expect(matches).toBe(true);
    });

    test("given matching name, when checking match, then returns true", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const selectedAuthor = { login: "user1", name: "User One" };

      const matches = helpers.noteAuthorMatchesSelection(
        "User One",
        selectedAuthor,
        {},
      );

      expect(matches).toBe(true);
    });

    test("given non-matching author, when checking match, then returns false", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const selectedAuthor = { login: "user1", name: "User One" };

      const matches = helpers.noteAuthorMatchesSelection(
        "user2",
        selectedAuthor,
        {},
      );

      expect(matches).toBe(false);
    });
  });

  describe("getAuthorInsightsSentimentLabel", () => {
    test("given positive sentiment, when getting label, then returns Positive", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const label = helpers.getAuthorInsightsSentimentLabel("positive");

      expect(label).toBe("Positive");
    });

    test("given negative sentiment, when getting label, then returns Negative", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const label = helpers.getAuthorInsightsSentimentLabel("negative");

      expect(label).toBe("Negative");
    });

    test("given neutral sentiment, when getting label, then returns Neutral", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const label = helpers.getAuthorInsightsSentimentLabel("neutral");

      expect(label).toBe("Neutral");
    });
  });

  describe("getAuthorInsightsSentimentBadgeClassName", () => {
    test("given positive sentiment, when getting badge class, then returns correct class", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const className = helpers.getAuthorInsightsSentimentBadgeClassName("positive");

      expect(className).toBe("author-insights-badge-sentiment-positive");
    });
  });

  describe("getAuthorInsightsStatusBadgeClassName", () => {
    test("given MERGED status, when getting badge class, then returns merged class", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const className = helpers.getAuthorInsightsStatusBadgeClassName("MERGED");

      expect(className).toBe("author-insights-badge-status-merged");
    });

    test("given CHANGED status, when getting badge class, then returns changed class", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());

      const className = helpers.getAuthorInsightsStatusBadgeClassName("CHANGED");

      expect(className).toBe("author-insights-badge-status-changed");
    });
  });

  describe("getAuthorInsightsCreatedPrStatus", () => {
    test("given merged PR, when getting status, then returns MERGED", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const entry = createPrRowEntry({
        data: { mergedAt: "2026-01-01T00:00:00Z" },
      });

      const status = helpers.getAuthorInsightsCreatedPrStatus(entry);

      expect(status).toBe("MERGED");
    });

    test("given closed PR, when getting status, then returns CLOSED", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const entry = createPrRowEntry({
        data: { closedAt: "2026-01-01T00:00:00Z" },
      });

      const status = helpers.getAuthorInsightsCreatedPrStatus(entry);

      expect(status).toBe("CLOSED");
    });

    test("given open PR, when getting status, then returns PR status", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const entry = createPrRowEntry({
        data: { status: "NO_CHANGE" },
      });

      const status = helpers.getAuthorInsightsCreatedPrStatus(entry);

      expect(status).toBe("NO_CHANGE");
    });
  });

  describe("createAuthorInsightsPrDataMeta", () => {
    test("given PR entry, when creating meta, then meta element with badges returned", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const entry = createPrRowEntry({
        data: {
          status: "NO_CHANGE",
          approved: "NO",
          approvalCount: "0",
          titleDisplay: "Test PR [CHK:PASS]",
          conversations: 2,
          viewedFiles: 3,
          totalFiles: 5,
          labels: ["bug"],
        },
      });

      const meta = helpers.createAuthorInsightsPrDataMeta(entry);

      expect(meta.className).toBe("author-insights-meta");
      expect(meta.textContent).toContain("Status: NO_CHANGE");
      expect(meta.textContent).toContain("Approved: NO (0)");
      expect(meta.textContent).toContain("CHK: PASS");
      expect(meta.textContent).toContain("Conversations: 2");
      expect(meta.textContent).toContain("Labels: 1");
    });
  });

  describe("sortAuthorInsightsManualCommentsDesc", () => {
    test("given comments, when sorting, then sorted by date descending", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const comments = [
        { id: "1", createdAt: "2026-01-01T00:00:00Z" },
        { id: "2", createdAt: "2026-01-03T00:00:00Z" },
        { id: "3", createdAt: "2026-01-02T00:00:00Z" },
      ];

      const sorted = helpers.sortAuthorInsightsManualCommentsDesc(comments);

      expect(sorted[0].id).toBe("2");
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1");
    });
  });

  describe("sortAuthorInsightsCreatedPrsDesc", () => {
    test("given rows, when sorting, then sorted by merged/updated date descending", () => {
      const helpers = createPrAuthorInsightsDisplayHelpers(createDependencies());
      const rows = [
        createPrRowEntry({
          prNumber: "1",
          data: { sourceUpdatedAt: "2026-01-01T00:00:00Z" },
        }),
        createPrRowEntry({
          prNumber: "2",
          data: { mergedAt: "2026-01-03T00:00:00Z" },
        }),
        createPrRowEntry({
          prNumber: "3",
          data: { closedAt: "2026-01-02T00:00:00Z" },
        }),
      ];

      const sorted = helpers.sortAuthorInsightsCreatedPrsDesc(rows);

      expect(sorted[0].prNumber).toBe("2");
      expect(sorted[1].prNumber).toBe("3");
      expect(sorted[2].prNumber).toBe("1");
    });
  });
});
