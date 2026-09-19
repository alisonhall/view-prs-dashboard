/** @jest-environment jsdom */

const { createPrDataTabsHelpers } = require("./pr-data-tabs.helpers.js");

function buildDom() {
  document.body.innerHTML = `
    <button id="tab-pr-data"></button>
    <button id="tab-review-stats"></button>
    <button id="tab-author-insights"></button>
    <div id="tab-panel-pr-data"></div>
    <div id="tab-panel-review-stats"></div>
    <div id="tab-panel-author-insights"></div>
  `;
}

function createHelpers(overrides = {}) {
  return createPrDataTabsHelpers({
    getOptionalElementById: (id) => document.getElementById(id),
    ...overrides,
  });
}

describe("pr-data-tabs helpers", () => {
  beforeEach(() => {
    buildDom();
  });

  test("given activateDataTab('review-stats'), when called, then only the review-stats tab/panel are marked active/visible", () => {
    const { activateDataTab } = createHelpers();

    activateDataTab("review-stats");

    expect(document.getElementById("tab-pr-data").className).toBe("data-tab-button");
    expect(document.getElementById("tab-review-stats").className).toBe(
      "data-tab-button is-active",
    );
    expect(document.getElementById("tab-author-insights").className).toBe("data-tab-button");

    expect(document.getElementById("tab-pr-data").getAttribute("aria-selected")).toBe("false");
    expect(document.getElementById("tab-review-stats").getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("tab-author-insights").getAttribute("aria-selected")).toBe(
      "false",
    );

    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(true);
    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(false);
    expect(document.getElementById("tab-panel-author-insights").hidden).toBe(true);
  });

  test("given activateDataTab is called, when the key changes to the just-activated tab, then onTabActivated is called with that key (Phase 5 catch-up render hook)", () => {
    const onTabActivated = jest.fn();
    const { activateDataTab } = createHelpers({ onTabActivated });

    activateDataTab("author-insights");

    expect(onTabActivated).toHaveBeenCalledWith("author-insights");
    expect(onTabActivated).toHaveBeenCalledTimes(1);
  });

  test("given no onTabActivated dependency was supplied, when activateDataTab is called, then it does not throw", () => {
    const { activateDataTab } = createHelpers();
    expect(() => activateDataTab("pr-data")).not.toThrow();
  });

  test("given a required tab/panel element is missing from the DOM, when activateDataTab is called, then it returns without touching any element or calling onTabActivated", () => {
    document.getElementById("tab-review-stats").remove();
    const onTabActivated = jest.fn();
    const { activateDataTab } = createHelpers({ onTabActivated });

    activateDataTab("pr-data");

    expect(onTabActivated).not.toHaveBeenCalled();
    expect(document.getElementById("tab-pr-data").className).toBe("");
  });

  test("given initDataTabs is called, when a tab button is clicked, then it activates that tab", () => {
    const { initDataTabs } = createHelpers();
    initDataTabs();

    document.getElementById("tab-review-stats").onclick();

    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(false);
    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(true);
  });

  test("given initDataTabs is called, when initialized, then it defaults to activating the pr-data tab", () => {
    const { initDataTabs } = createHelpers();
    initDataTabs();

    expect(document.getElementById("tab-pr-data").className).toBe("data-tab-button is-active");
    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(false);
  });

  test("given a required tab button is missing from the DOM, when initDataTabs is called, then it returns without wiring any click handler", () => {
    document.getElementById("tab-author-insights").remove();
    const { initDataTabs } = createHelpers();

    expect(() => initDataTabs()).not.toThrow();
    expect(document.getElementById("tab-pr-data").onclick).toBeNull();
  });
});
