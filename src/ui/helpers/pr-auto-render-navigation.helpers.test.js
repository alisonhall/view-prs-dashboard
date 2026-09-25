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

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): navigateToPrInTable used to unconditionally
  // mutate the insights row's `.hidden`/toggle-button text directly, with
  // no isReactTableMounted guard (unlike its sibling,
  // pr-author-insights-pr-link.helpers.js) - once React owns #pr-sections,
  // that direct mutation would desync from React's own expandedInsights
  // state (the toggle button claiming "expanded" while the insights
  // content never actually renders). Mirrors the sibling's own fix.
  describe("navigateToPrInTable's React-mounted guard", () => {
    const renderPrLinkRow = () => {
      document.body.innerHTML = `
        <table>
          <tbody>
            <tr>
              <td class="pr-number-cell"><a class="pr-link">#123</a></td>
              <td><button class="row-insights-toggle" aria-expanded="false">Show insights</button></td>
            </tr>
            <tr hidden>
              <td class="insights-row-cell"></td>
            </tr>
          </tbody>
        </table>
      `;
      const prLink = document.querySelector(".pr-link");
      prLink.scrollIntoView = jest.fn();
      prLink.focus = jest.fn();
      return prLink;
    };

    test("given React owns the table, when navigating to a PR, then it dispatches pr-navigate-to-insights instead of mutating the row directly", () => {
      renderPrLinkRow();
      const dispatched = [];
      window.addEventListener("pr-navigate-to-insights", (event) => dispatched.push(event.detail));

      const { navigateToPrInTable } = createHelpers({ isReactTableMounted: () => true });
      navigateToPrInTable("123");

      expect(dispatched).toEqual([{ prNumber: "123" }]);
      const nextRow = document.querySelectorAll("tr")[1];
      const toggleButton = document.querySelector(".row-insights-toggle");
      expect(nextRow.hidden).toBe(true); // untouched - React's own listener would handle expansion
      expect(toggleButton.textContent).toBe("Show insights");
      expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
    });

    test("given React does not own the table, when navigating to a PR, then it mutates the insights row directly (legacy behavior)", () => {
      renderPrLinkRow();
      const dispatched = [];
      window.addEventListener("pr-navigate-to-insights", (event) => dispatched.push(event.detail));

      const { navigateToPrInTable } = createHelpers({ isReactTableMounted: () => false });
      navigateToPrInTable("123");

      expect(dispatched).toEqual([]);
      const nextRow = document.querySelectorAll("tr")[1];
      const toggleButton = document.querySelector(".row-insights-toggle");
      expect(nextRow.hidden).toBe(false);
      expect(toggleButton.textContent).toBe("Hide insights");
      expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
    });
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
