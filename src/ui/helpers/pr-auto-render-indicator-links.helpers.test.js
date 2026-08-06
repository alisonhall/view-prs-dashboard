/** @jest-environment jsdom */

const {
  createPrAutoRenderIndicatorLinksHelpers,
} = require("./pr-auto-render-indicator-links.helpers.js");

describe("auto render indicator links helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrAutoRenderIndicatorLinksHelpers({
      clearElementContents: (element) => {
        element.innerHTML = "";
      },
      getAuthorInsightsDisplayName: (authorLogin) =>
        ({ alice: "Alice A", bob: "Bob B" }[
          String(authorLogin || "").trim().toLowerCase()
        ] || String(authorLogin || "")),
      navigateToPrInTable: () => {},
      navigateToAuthorInsights: () => {},
      buildAutoRenderBlockedLinksAriaLabel: ({
        blockingPrLabel,
        blockingAuthorInsightsLogins,
      }) =>
        String(blockingPrLabel || "").trim() ||
        (Array.isArray(blockingAuthorInsightsLogins) &&
        blockingAuthorInsightsLogins.length > 0
          ? `Blocking author drafts: ${blockingAuthorInsightsLogins.join(", ")}`
          : ""),
      documentRef: document,
      ...overrides,
    });

  test("given no blocking items, when rendering blocked links, then host is hidden and aria label is empty", () => {
    document.body.innerHTML = '<div id="links"></div>';
    const linksHost = document.getElementById("links");
    const { renderAutoRenderBlockedLinks } = createHelpers();

    renderAutoRenderBlockedLinks({
      linksHost,
      blockingPrNumbers: [],
      blockingAuthorInsightsLogins: [],
      blockingPrLabel: "",
    });

    expect(linksHost.hidden).toBe(true);
    expect(linksHost.children).toHaveLength(0);
    expect(linksHost.getAttribute("aria-label")).toBe("");
  });

  test("given blocking PR and author items, when rendering blocked links, then buttons and click handlers are wired", () => {
    document.body.innerHTML = '<div id="links"></div>';
    const linksHost = document.getElementById("links");
    const prCalls = [];
    const authorCalls = [];
    const { renderAutoRenderBlockedLinks } = createHelpers({
      navigateToPrInTable: (...args) => {
        prCalls.push(args);
      },
      navigateToAuthorInsights: (...args) => {
        authorCalls.push(args);
      },
      buildAutoRenderBlockedLinksAriaLabel: () => "Blocking PRs: #15",
    });

    renderAutoRenderBlockedLinks({
      linksHost,
      blockingPrNumbers: ["15"],
      blockingAuthorInsightsLogins: ["alice"],
      blockingPrLabel: "Blocking PRs: #15",
    });

    expect(linksHost.hidden).toBe(false);
    expect(linksHost.children).toHaveLength(2);
    expect(linksHost.children[0].textContent).toBe("#15");
    expect(linksHost.children[1].textContent).toBe("Author: Alice A");

    linksHost.children[0].click();
    linksHost.children[1].click();

    expect(prCalls).toEqual([["15", { focusUnsaved: true }]]);
    expect(authorCalls).toEqual([["alice", { focusUnsaved: true }]]);
    expect(linksHost.getAttribute("aria-label")).toBe("Blocking PRs: #15");
  });
});
