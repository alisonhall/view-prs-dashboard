/** @jest-environment jsdom */

const {
  createPrManagementTabsHelpers,
} = require("./pr-management-tabs.helpers.js");

function buildDom({ includeOptional = true } = {}) {
  document.body.innerHTML = `
    <button id="tab-status"></button>
    <button id="tab-script"></button>
    <button id="tab-backfill"></button>
    <div id="tab-panel-status"></div>
    <div id="tab-panel-script"></div>
    <div id="tab-panel-backfill"></div>
    ${
      includeOptional
        ? `
    <button id="tab-action-log"></button>
    <button id="tab-actor-name-cache"></button>
    <button id="tab-export"></button>
    <div id="tab-panel-action-log"></div>
    <div id="tab-panel-actor-name-cache"></div>
    <div id="tab-panel-export"></div>
    `
        : ""
    }
  `;
}

function createHelpers(overrides = {}) {
  return createPrManagementTabsHelpers({
    getOptionalElementById: (id) => document.getElementById(id),
    loadActionLog: jest.fn(() => Promise.resolve()),
    loadActorNameCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  });
}

describe("pr-management-tabs helpers", () => {
  test("given initManagementTabs is called, when initialized, then it defaults to activating the status tab", () => {
    buildDom();
    createHelpers().initManagementTabs();

    expect(document.getElementById("tab-status").className).toBe(
      "management-tab-button is-active",
    );
    expect(document.getElementById("tab-panel-status").hidden).toBe(false);
    expect(document.getElementById("tab-panel-script").hidden).toBe(true);
  });

  test("given the script tab is clicked, when activated, then only the script tab/panel are marked active/visible", () => {
    buildDom();
    createHelpers().initManagementTabs();

    document.getElementById("tab-script").onclick();

    expect(document.getElementById("tab-script").className).toBe(
      "management-tab-button is-active",
    );
    expect(document.getElementById("tab-script").getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("tab-panel-script").hidden).toBe(false);
    expect(document.getElementById("tab-panel-status").hidden).toBe(true);
  });

  test("given the action-log tab is clicked, when activated, then loadActionLog is called", () => {
    buildDom();
    const loadActionLog = jest.fn(() => Promise.resolve());
    createHelpers({ loadActionLog }).initManagementTabs();

    document.getElementById("tab-action-log").onclick();

    expect(loadActionLog).toHaveBeenCalledTimes(1);
    expect(document.getElementById("tab-panel-action-log").hidden).toBe(false);
  });

  test("given the actor-name-cache tab is clicked, when activated, then loadActorNameCache is called", () => {
    buildDom();
    const loadActorNameCache = jest.fn(() => Promise.resolve());
    createHelpers({ loadActorNameCache }).initManagementTabs();

    document.getElementById("tab-actor-name-cache").onclick();

    expect(loadActorNameCache).toHaveBeenCalledTimes(1);
  });

  test("given a non-action-log/actor-name-cache tab is clicked, when activated, then neither loader is called", () => {
    buildDom();
    const loadActionLog = jest.fn(() => Promise.resolve());
    const loadActorNameCache = jest.fn(() => Promise.resolve());
    createHelpers({ loadActionLog, loadActorNameCache }).initManagementTabs();

    document.getElementById("tab-backfill").onclick();

    expect(loadActionLog).not.toHaveBeenCalled();
    expect(loadActorNameCache).not.toHaveBeenCalled();
  });

  test("given loadActorNameCache is not provided, when the actor-name-cache tab is clicked, then it does not throw", () => {
    buildDom();
    const { initManagementTabs } = createHelpers({ loadActorNameCache: undefined });
    initManagementTabs();

    expect(() => document.getElementById("tab-actor-name-cache").onclick()).not.toThrow();
  });

  test("given the optional export/action-log/actor-name-cache tabs are absent from the DOM, when initManagementTabs is called, then it still wires up the three required tabs without throwing", () => {
    buildDom({ includeOptional: false });
    expect(() => createHelpers().initManagementTabs()).not.toThrow();

    expect(document.getElementById("tab-status").className).toBe(
      "management-tab-button is-active",
    );
  });

  test("given a required tab element is missing from the DOM, when initManagementTabs is called, then it returns without wiring any click handler", () => {
    buildDom();
    document.getElementById("tab-backfill").remove();
    createHelpers().initManagementTabs();

    expect(document.getElementById("tab-status").onclick).toBeNull();
  });
});
