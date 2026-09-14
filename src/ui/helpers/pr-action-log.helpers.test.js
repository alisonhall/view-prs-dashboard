/** @jest-environment jsdom */

const { createPrActionLogHelpers } = require("./pr-action-log.helpers.js");

function createHelpers(overrides = {}) {
  return createPrActionLogHelpers({
    fetch: jest.fn(),
    getOptionalElementById: (id) => document.getElementById(id),
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    formatIsoDatetime: (iso) => `formatted(${iso})`,
    ...overrides,
  });
}

describe("pr-action-log helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="action-log-container"></div>';
  });

  describe("renderActionLog", () => {
    test("given no container element, when called, then it does not throw", () => {
      document.body.innerHTML = "";
      const { renderActionLog } = createHelpers();
      expect(() => renderActionLog([{ action: "ack" }])).not.toThrow();
    });

    test("given an empty entries array, when called, then it renders the empty-state message", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog([]);
      expect(document.getElementById("action-log-container").innerHTML).toContain(
        "No actions logged yet.",
      );
    });

    test("given entries is not an array, when called, then it also renders the empty-state message", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog(null);
      expect(document.getElementById("action-log-container").innerHTML).toContain(
        "No actions logged yet.",
      );
    });

    test("given a successful entry with detail, when called, then it renders an OK badge, formatted duration/timestamp, and joined detail parts", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog([
        {
          triggeredAt: "2026-01-01T00:00:00Z",
          action: "ack",
          ok: true,
          durationMs: 250,
          detail: { prNumber: "1", repo: "owner/repo" },
        },
      ]);

      const html = document.getElementById("action-log-container").innerHTML;
      expect(html).toContain("formatted(2026-01-01T00:00:00Z)");
      expect(html).toContain("action-log-status-ok");
      expect(html).toContain("250ms");
      expect(html).toContain("prNumber: 1");
      expect(html).toContain("repo: owner/repo");
    });

    test("given a failed entry, when called, then it renders a Failed badge, a duration in seconds, and includes the error in the detail column", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog([
        {
          action: "ack",
          ok: false,
          durationMs: 2500,
          error: "boom",
        },
      ]);

      const html = document.getElementById("action-log-container").innerHTML;
      expect(html).toContain("action-log-status-fail");
      expect(html).toContain("2.5s");
      expect(html).toContain("error: boom");
    });

    test("given an entry with no triggeredAt/durationMs/detail, when called, then it falls back to placeholder text for each", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog([{ action: "ack", ok: true }]);

      const html = document.getElementById("action-log-container").innerHTML;
      expect(html).toContain("(unknown)");
      expect(html).toMatch(/<td>-<\/td>/);
    });

    test("given entry.action or entry.detail values contain HTML-significant characters, when called, then they are escaped via the injected escapeHtml", () => {
      const { renderActionLog } = createHelpers();
      renderActionLog([{ action: "<script>", ok: true, detail: { note: "<b>x</b>" } }]);

      // Read back via textContent (not innerHTML): jsdom re-serializes
      // parsed numeric entities to their canonical named form on innerHTML
      // read, so asserting the exact entity escapeHtml produced would
      // couple this test to jsdom's own serialization, not to whether
      // escaping happened at all.
      const container = document.getElementById("action-log-container");
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("code").textContent).toBe("<script>");
      expect(container.querySelector(".action-log-detail").textContent).toBe("note: <b>x</b>");
    });
  });

  describe("loadActionLog", () => {
    test("given the fetch resolves ok with entries, when called, then it renders those entries", async () => {
      const fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, entries: [{ action: "ack", ok: true }] }),
      });
      const { loadActionLog } = createHelpers({ fetch });

      await loadActionLog();

      expect(fetch).toHaveBeenCalledWith("/view-prs/action-log");
      expect(document.getElementById("action-log-container").innerHTML).toContain("action-log-table");
    });

    test("given the response is not ok, when called, then it renders a failure message instead of throwing", async () => {
      const fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ ok: false, error: "server exploded" }),
      });
      const { loadActionLog } = createHelpers({ fetch });

      await loadActionLog();

      expect(document.getElementById("action-log-container").innerHTML).toContain(
        "Failed to load action log: server exploded",
      );
    });

    test("given fetch itself rejects, when called, then it renders a failure message using the error's message", async () => {
      const fetch = jest.fn().mockRejectedValue(new Error("network down"));
      const { loadActionLog } = createHelpers({ fetch });

      await loadActionLog();

      expect(document.getElementById("action-log-container").innerHTML).toContain(
        "Failed to load action log: network down",
      );
    });

    test("given a container exists, when called, then it shows a loading state before the fetch resolves", async () => {
      let capturedLoadingHtml;
      const fetch = jest.fn().mockImplementation(() => {
        capturedLoadingHtml = document.getElementById("action-log-container").innerHTML;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, entries: [] }) });
      });
      const { loadActionLog } = createHelpers({ fetch });

      await loadActionLog();

      expect(capturedLoadingHtml).toContain("Loading...");
    });
  });
});
