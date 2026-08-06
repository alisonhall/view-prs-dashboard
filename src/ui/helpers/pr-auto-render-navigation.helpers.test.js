/** @jest-environment jsdom */

const {
  createPrAutoRenderNavigationHelpers,
} = require("./pr-auto-render-navigation.helpers.js");

describe("auto render navigation helpers", () => {
  const createHelpers = (overrides = {}) => {
    const authorInsightsState = {
      selectedAuthorLogin: "",
      latestRows: [{ id: 1 }],
      latestActorsMap: { alice: "Alice" },
    };
    const {
      authorInsightsState: overrideAuthorInsightsState = {},
      ...otherOverrides
    } = overrides;

    return createPrAutoRenderNavigationHelpers({
      normalizePrNumber: (value) => {
        const normalized = String(value || "").trim();
        return /^\d+$/.test(normalized) ? normalized : "";
      },
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      activateDataTab: () => {},
      collectNodesByTag: (host, tag) => Array.from(host.querySelectorAll(tag)),
      expandAncestorDetailsElements: () => {},
      ensureInsightsRowVisibleForElement: () => {},
      getFirstUnsavedElementForPrNumber: () => null,
      getOptionalElementById: (id) => document.getElementById(id),
      getAuthorInsightsComposerDraft: () => ({ note: "", sentiment: "neutral" }),
      isAuthorInsightsComposerDraftDirty: () => false,
      getAuthorInsightsEditDraftMap: () => ({}),
      getAuthorManualCommentsForLogin: () => [],
      isAuthorInsightsEditDraftDirty: () => false,
      authorInsightsState: {
        ...authorInsightsState,
        ...overrideAuthorInsightsState,
      },
      renderAuthorInsights: () => {},
      documentRef: document,
      setTimeoutFn: (fn) => fn(),
      ...otherOverrides,
    });
  };

  test("given invalid PR value, when navigating to PR in table, then false is returned", () => {
    const { navigateToPrInTable } = createHelpers();
    expect(navigateToPrInTable("abc")).toBe(false);
  });

  test("given dirty composer draft, when getting first dirty author insights element, then composer textarea is prioritized", () => {
    document.body.innerHTML = `
      <section id="author-insights">
        <textarea class="author-insights-comment-textarea" data-author-login="alice" data-draft-kind="composer"></textarea>
        <select id="author-insights-select"></select>
      </section>
    `;

    const { getFirstDirtyAuthorInsightsElement } = createHelpers({
      getAuthorInsightsComposerDraft: () => ({ note: "Unsaved draft", sentiment: "neutral" }),
      isAuthorInsightsComposerDraftDirty: () => true,
    });

    const target = getFirstDirtyAuthorInsightsElement("alice");
    expect(target).not.toBeNull();
    expect(target.className).toContain("author-insights-comment-textarea");
  });

  test("given valid author login, when navigating to author insights, then selected login is updated and navigation succeeds", () => {
    document.body.innerHTML = `
      <section id="author-insights">
        <select id="author-insights-select"></select>
      </section>
    `;

    const calls = [];
    const state = {
      selectedAuthorLogin: "",
      latestRows: [{ id: 1 }],
      latestActorsMap: { alice: "Alice" },
    };
    const { navigateToAuthorInsights } = createHelpers({
      authorInsightsState: state,
      activateDataTab: (tab) => calls.push(tab),
      renderAuthorInsights: () => calls.push("render"),
    });

    expect(navigateToAuthorInsights("Alice", { focusUnsaved: false })).toBe(true);
    expect(calls).toEqual(["author-insights", "render"]);
  });
});
