const { createPrManagementTabsHelpers } = require("../helpers/pr-management-tabs.helpers.js");
const { createPrActionLogHelpers } = require("../helpers/pr-action-log.helpers.js");

const makeElement = () => {
  const attrs = {};
  return {
    className: "",
    hidden: false,
    onclick: null,
    innerHTML: "",
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return attrs[name];
    },
  };
};

describe("pr management tabs helpers", () => {
  test("given required management tab elements are missing, when initManagementTabs runs, then no loaders are called", () => {
    const loadActionLog = jest.fn();
    const loadActorNameCache = jest.fn();
    const helpers = createPrManagementTabsHelpers({
      getOptionalElementById: () => null,
      loadActionLog,
      loadActorNameCache,
    });

    expect(() => helpers.initManagementTabs()).not.toThrow();
    expect(loadActionLog).not.toHaveBeenCalled();
    expect(loadActorNameCache).not.toHaveBeenCalled();
  });

  test("given management tabs are wired, when tabs are activated, then classes, aria, panels, and loaders are updated", () => {
    const elements = {
      "tab-status": makeElement(),
      "tab-script": makeElement(),
      "tab-backfill": makeElement(),
      "tab-action-log": makeElement(),
      "tab-actor-name-cache": makeElement(),
      "tab-panel-status": makeElement(),
      "tab-panel-script": makeElement(),
      "tab-panel-backfill": makeElement(),
      "tab-panel-action-log": makeElement(),
      "tab-panel-actor-name-cache": makeElement(),
    };

    const loadActionLog = jest.fn(async () => {});
    const loadActorNameCache = jest.fn(async () => {});
    const helpers = createPrManagementTabsHelpers({
      getOptionalElementById: (id) => elements[id] || null,
      loadActionLog,
      loadActorNameCache,
    });

    helpers.initManagementTabs();

    expect(elements["tab-status"].className).toContain("is-active");
    expect(elements["tab-panel-status"].hidden).toBe(false);
    expect(elements["tab-panel-script"].hidden).toBe(true);

    elements["tab-action-log"].onclick();
    expect(elements["tab-action-log"].className).toContain("is-active");
    expect(elements["tab-panel-action-log"].hidden).toBe(false);
    expect(elements["tab-status"].getAttribute("aria-selected")).toBe("false");
    expect(loadActionLog).toHaveBeenCalled();

    elements["tab-actor-name-cache"].onclick();
    expect(elements["tab-actor-name-cache"].className).toContain("is-active");
    expect(elements["tab-panel-actor-name-cache"].hidden).toBe(false);
    expect(loadActorNameCache).toHaveBeenCalled();
  });
});

describe("pr action log helpers", () => {
  test("renderActionLog shows empty-state message when entries are missing", () => {
    const container = makeElement();
    const helpers = createPrActionLogHelpers({
      fetch: jest.fn(),
      getOptionalElementById: () => container,
      escapeHtml: (value) => String(value || "").replace(/</g, "&lt;"),
      formatIsoDatetime: (value) => `fmt:${value}`,
    });

    helpers.renderActionLog([]);
    expect(container.innerHTML).toContain("No actions logged yet");
  });

  test("renderActionLog renders table rows with statuses and escaped details", () => {
    const container = makeElement();
    const helpers = createPrActionLogHelpers({
      fetch: jest.fn(),
      getOptionalElementById: () => container,
      escapeHtml: (value) => String(value || "").replace(/</g, "&lt;"),
      formatIsoDatetime: (value) => `fmt:${value}`,
    });

    helpers.renderActionLog([
      {
        triggeredAt: "2026-05-01T10:00:00Z",
        action: "manual-start",
        ok: true,
        durationMs: 250,
        detail: { repo: "owner/repo" },
      },
      {
        triggeredAt: "2026-05-01T10:01:00Z",
        action: "manual-stop",
        ok: false,
        durationMs: 1500,
        detail: { reason: "<failed>" },
        error: "boom",
      },
    ]);

    expect(container.innerHTML).toContain("action-log-table");
    expect(container.innerHTML).toContain("fmt:2026-05-01T10:00:00Z");
    expect(container.innerHTML).toContain("250ms");
    expect(container.innerHTML).toContain("1.5s");
    expect(container.innerHTML).toContain("action-log-status-fail");
    expect(container.innerHTML).toContain("reason: &lt;failed>");
    expect(container.innerHTML).toContain("error: boom");
  });

  test("loadActionLog handles success and failure responses", async () => {
    const container = makeElement();
    const fetch = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: [] }),
      }))
      .mockImplementationOnce(async () => ({
        ok: false,
        json: async () => ({ ok: false, error: "unavailable" }),
      }));

    const helpers = createPrActionLogHelpers({
      fetch,
      getOptionalElementById: () => container,
      escapeHtml: (value) => String(value || "").replace(/</g, "&lt;"),
      formatIsoDatetime: (value) => `fmt:${value}`,
    });

    await helpers.loadActionLog();
    expect(container.innerHTML).toContain("No actions logged yet");

    await helpers.loadActionLog();
    expect(container.innerHTML).toContain("Failed to load action log: unavailable");
  });
});
