/**
 * Author Insights Component Tests (Updated for Refactored Structure)
 *
 * @jest-environment jsdom
 */

const {
  createPrAuthorInsightsComponent,
} = require("./pr-author-insights.component.js");
const { createPrRowEntry } = require("../test-fixtures/pr-row.fixtures.js");
const {
  createPrAuthorInsightsPrLinkHelpers,
} = require("../helpers/pr-author-insights-pr-link.helpers.js");
const {
  createPrAuthorInsightsDisplayHelpers,
} = require("../helpers/pr-author-insights-display.helpers.js");
const {
  createPrAuthorInsightsDataHelpers,
} = require("../helpers/pr-author-insights-data.helpers.js");
const {
  createPrAuthorInsightsDraftsHelpers,
} = require("../helpers/pr-author-insights-drafts.helpers.js");

describe("pr author insights component (refactored)", () => {
  const createBasicDependencies = () => ({
    resolveActorDisplayName: (login, actorsMap, fallback) =>
      actorsMap[login] || fallback || login,
    getPreferredActorKey: (login, fallback) => String(login || fallback || "").trim(),
    normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
    normalizeAuthorInsightsSentiment: (value) => {
      const normalized = String(value || "neutral").trim().toLowerCase();
      return ["positive", "negative", "neutral"].includes(normalized)
        ? normalized
        : "neutral";
    },
    isChangedStatus: (value) => String(value || "").toUpperCase() === "CHANGED",
    toCount: (value) => Number(value || 0),
    parseMarkerState: () => "-",
    formatChkDisplay: (value) => String(value || "-"),
    getOpenConversationCount: () => 0,
    getViewedFilesSummary: () => "0/0 viewed",
    asArray: (value) => (Array.isArray(value) ? value : []),
    parseSortableTime: (value) => Date.parse(String(value || "")) || 0,
    formatIsoDatetime: (value) => String(value || "-"),
    fetchFn: async () => ({ ok: true, json: async () => ({ ok: true, comments: [] }) }),
    activateDataTab: () => {},
    collectNodesByTag: () => [],
  });

  const createDependencies = (overrides = {}) => {
    const basicDeps = createBasicDependencies();

    const authorInsightsState = {
      latestRows: null,
      latestActorsMap: null,
      selectedAuthorLogin: "",
      manualCommentsByAuthorLogin: {},
      manualCommentsLoadingByAuthorLogin: {},
      manualCommentsErrorByAuthorLogin: {},
      manualCommentDraftByAuthorLogin: {},
      manualCommentEditDraftByAuthorLogin: {},
      ...overrides.authorInsightsState,
    };

    // Create helper modules
    const prLinkHelpers = createPrAuthorInsightsPrLinkHelpers({
      DEFAULT_REPO: "owner/repo",
      activateDataTab: basicDeps.activateDataTab,
      collectNodesByTag: basicDeps.collectNodesByTag,
    });

    const displayHelpers = createPrAuthorInsightsDisplayHelpers({
      resolveActorDisplayName: basicDeps.resolveActorDisplayName,
      getPreferredActorKey: basicDeps.getPreferredActorKey,
      normalizeActorLogin: basicDeps.normalizeActorLogin,
      normalizeAuthorInsightsSentiment: basicDeps.normalizeAuthorInsightsSentiment,
      isChangedStatus: basicDeps.isChangedStatus,
      toCount: basicDeps.toCount,
      parseMarkerState: basicDeps.parseMarkerState,
      formatChkDisplay: basicDeps.formatChkDisplay,
      getOpenConversationCount: basicDeps.getOpenConversationCount,
      getViewedFilesSummary: basicDeps.getViewedFilesSummary,
      asArray: basicDeps.asArray,
      parseSortableTime: basicDeps.parseSortableTime,
      formatIsoDatetime: basicDeps.formatIsoDatetime,
    });

    const dataHelpers = createPrAuthorInsightsDataHelpers({
      normalizeActorLogin: basicDeps.normalizeActorLogin,
      fetchFn: basicDeps.fetchFn,
    });

    const draftHelpers = createPrAuthorInsightsDraftsHelpers({
      DEFAULT_AUTHOR_INSIGHTS_SENTIMENT: "neutral",
      normalizeAuthorInsightsSentiment: basicDeps.normalizeAuthorInsightsSentiment,
    });

    return {
      prLinkHelpers,
      displayHelpers,
      dataHelpers,
      draftHelpers,
      authorInsightsState,
      postJson: async () => ({
        response: { ok: true },
        result: { ok: true, comments: [] },
      }),
      recomputeDirtyPrSectionsFields: () => {},
      DEFAULT_REPO: "owner/repo",
      DEFAULT_AUTHOR_INSIGHTS_SENTIMENT: "neutral",
      ...overrides,
    };
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="author-insights"></div>';
  });

  test("given empty author rows, when renderAuthorInsights is called, then an empty-state message is shown", () => {
    const component = createPrAuthorInsightsComponent(createDependencies());

    component.renderAuthorInsights([], {});

    const host = document.getElementById("author-insights");
    expect(host?.textContent).toContain("No local rows available for author insights.");
  });

  test("given a valid row fixture, when renderAuthorInsights is called, then the React selector/header bridges are called with the resolved author", () => {
    const updateReactAuthorInsightsSelector = jest.fn(() => true);
    const updateReactAuthorInsightsHeader = jest.fn(() => true);
    const component = createPrAuthorInsightsComponent(
      createDependencies({
        updateReactAuthorInsightsSelector,
        updateReactAuthorInsightsHeader,
      }),
    );
    const rows = [createPrRowEntry()];

    component.renderAuthorInsights(rows, {
      "author-login": "Author Name",
    });

    expect(updateReactAuthorInsightsSelector).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Author Name" })]),
      expect.any(String),
    );
    expect(updateReactAuthorInsightsHeader).toHaveBeenCalledWith("Author Name");
  });

  test("given a rows update, when renderAuthorInsights re-runs, then the manual comments React bridge is called with the resolved author (composer draft persistence is now covered by AuthorInsightsCommentsSection.test.jsx, since the composer moved into that component - Track B batch 2, REACT_MIGRATION_PLAN.md)", () => {
    const updateReactAuthorInsightsComments = jest.fn(() => true);
    const component = createPrAuthorInsightsComponent(
      createDependencies({ updateReactAuthorInsightsComments }),
    );
    const rows = [createPrRowEntry()];

    component.renderAuthorInsights(rows, { "author-login": "Author Name" });

    expect(updateReactAuthorInsightsComments).toHaveBeenCalledWith(
      rows,
      expect.objectContaining({ name: "Author Name" }),
      { "author-login": "Author Name" },
    );
  });

  test("given missing required helpers, when creating component, then error thrown", () => {
    expect(() => {
      createPrAuthorInsightsComponent({
        authorInsightsState: {},
      });
    }).toThrow("Author Insights Component requires prLinkHelpers");
  });

  test("given missing state, when creating component, then error thrown", () => {
    const basicDeps = createBasicDependencies();
    const prLinkHelpers = createPrAuthorInsightsPrLinkHelpers({});
    const displayHelpers = createPrAuthorInsightsDisplayHelpers(basicDeps);
    const dataHelpers = createPrAuthorInsightsDataHelpers(basicDeps);
    const draftHelpers = createPrAuthorInsightsDraftsHelpers({});

    expect(() => {
      createPrAuthorInsightsComponent({
        prLinkHelpers,
        displayHelpers,
        dataHelpers,
        draftHelpers,
      });
    }).toThrow("Author Insights Component requires authorInsightsState");
  });
});
