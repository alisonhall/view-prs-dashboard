/** @jest-environment jsdom */

const {
  createPrAutoRenderIndicatorLinksHelpers,
} = require("./pr-auto-render-indicator-links.helpers.js");

describe("auto render indicator links helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrAutoRenderIndicatorLinksHelpers({
      buildAutoRenderBlockedLinksAriaLabel: ({
        blockingPrLabel,
        blockingAuthorInsightsLogins,
      }) =>
        String(blockingPrLabel || "").trim() ||
        (Array.isArray(blockingAuthorInsightsLogins) &&
        blockingAuthorInsightsLogins.length > 0
          ? `Blocking author drafts: ${blockingAuthorInsightsLogins.join(", ")}`
          : ""),
      ...overrides,
    });

  afterEach(() => {
    delete window.updateReactAutoRenderBlockedLinks;
  });

  test("given no linksHost, when rendering blocked links, then nothing throws", () => {
    const { renderAutoRenderBlockedLinks } = createHelpers();
    expect(() => renderAutoRenderBlockedLinks({ linksHost: null })).not.toThrow();
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
    expect(linksHost.getAttribute("aria-label")).toBe("");
  });

  test("given blocking PR and author items, when rendering blocked links, then the host is shown and the React bridge is called with the raw lists", () => {
    document.body.innerHTML = '<div id="links"></div>';
    const linksHost = document.getElementById("links");
    const bridgeCalls = [];
    window.updateReactAutoRenderBlockedLinks = (...args) => bridgeCalls.push(args);
    const { renderAutoRenderBlockedLinks } = createHelpers({
      buildAutoRenderBlockedLinksAriaLabel: () => "Blocking PRs: #15",
    });

    renderAutoRenderBlockedLinks({
      linksHost,
      blockingPrNumbers: ["15"],
      blockingAuthorInsightsLogins: ["alice"],
      blockingPrLabel: "Blocking PRs: #15",
    });

    expect(linksHost.hidden).toBe(false);
    expect(linksHost.getAttribute("aria-label")).toBe("Blocking PRs: #15");
    expect(bridgeCalls).toEqual([[["15"], ["alice"]]]);
  });

  test("given the React bridge is not installed, when rendering blocked links, then nothing throws", () => {
    document.body.innerHTML = '<div id="links"></div>';
    const linksHost = document.getElementById("links");
    const { renderAutoRenderBlockedLinks } = createHelpers();

    expect(() =>
      renderAutoRenderBlockedLinks({
        linksHost,
        blockingPrNumbers: ["15"],
        blockingAuthorInsightsLogins: [],
      }),
    ).not.toThrow();
  });

  test("given no buildAutoRenderBlockedLinksAriaLabel dependency is injected, when rendering blocked links, then a safe empty aria label fallback is used", () => {
    document.body.innerHTML = '<div id="links"></div>';
    const linksHost = document.getElementById("links");
    const { renderAutoRenderBlockedLinks } = createPrAutoRenderIndicatorLinksHelpers();

    renderAutoRenderBlockedLinks({ linksHost, blockingPrLabel: "Blocking PRs: #15" });

    expect(linksHost.getAttribute("aria-label")).toBe("Blocking PRs: #15");
  });
});
