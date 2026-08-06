/** @jest-environment jsdom */

const {
  createPrJsonModalComponent,
} = require("./pr-json-modal.component.js");

describe("pr json modal component", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("given a row and stored payload, when opening PR JSON modal, then modal content and diff metadata are rendered", async () => {
    const component = createPrJsonModalComponent({
      getPerPrUserStateFromPayload: () => ({ notesByPrNumber: { note: "x" } }),
      getLatestStoredPayload: () => ({ byPrNumber: { "101": { repo: "owner/repo", data: {} } } }),
      getLatestSelectedRepo: () => "owner/repo",
      defaultRepo: "owner/default",
      safeJsonStringify: (value) => JSON.stringify(value),
      formatDiffSummaryLine: () => "diff summary",
      buildPrJsonModalAiClipboardText: () => "clipboard payload",
      renderDiffText: (node, diffText) => {
        node.textContent = diffText;
      },
      setClassToken: (node, token, enabled) => {
        node.className = enabled
          ? `${node.className} ${token}`.trim()
          : String(node.className || "")
              .split(/\s+/)
              .filter((value) => value && value !== token)
              .join(" ");
      },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, diffText: "diff --git a/a.js b/a.js", source: "fresh" }),
      }),
      documentRef: document,
      navigatorRef: { clipboard: { writeText: async () => {} } },
      setTimeoutFn: (cb) => cb(),
    });

    await component.openPrJsonModal({ prNumber: 101 }, { number: 101 });

    const modal = document.getElementById("pr-json-modal");
    expect(modal).toBeTruthy();
    expect(modal?.hidden).toBe(false);
    expect(document.querySelector(".pr-json-modal-subtitle")?.textContent).toContain("PR #101");
    expect(document.querySelector(".pr-json-diff-meta")?.textContent).toBe("diff summary");
    expect(document.querySelector(".pr-json-diff")?.textContent).toContain("diff --git");
  });

  test("given an open modal, when pressing Escape, then the modal closes", async () => {
    const component = createPrJsonModalComponent({
      getPerPrUserStateFromPayload: () => ({}),
      getLatestStoredPayload: () => ({ byPrNumber: { "101": { repo: "owner/repo", data: {} } } }),
      getLatestSelectedRepo: () => "owner/repo",
      defaultRepo: "owner/default",
      safeJsonStringify: () => "{}",
      formatDiffSummaryLine: () => "diff summary",
      buildPrJsonModalAiClipboardText: () => "clipboard payload",
      renderDiffText: () => {},
      setClassToken: () => {},
      fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, diffText: "x" }) }),
      documentRef: document,
      navigatorRef: { clipboard: { writeText: async () => {} } },
      setTimeoutFn: (cb) => cb(),
    });

    await component.openPrJsonModal({ prNumber: 101 }, { number: 101 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.getElementById("pr-json-modal")?.hidden).toBe(true);
  });

  test("given default formatter composition, when opening PR JSON modal, then diff summary and copy-all payload are generated", async () => {
    const clipboardWrites = [];
    const component = createPrJsonModalComponent({
      getPerPrUserStateFromPayload: () => ({}),
      getLatestStoredPayload: () => ({ byPrNumber: { "101": { repo: "owner/repo", data: {} } } }),
      getLatestSelectedRepo: () => "owner/repo",
      defaultRepo: "owner/default",
      safeJsonStringify: (value) => JSON.stringify(value),
      setClassToken: () => {},
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          diffText: "diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new",
          source: "fresh",
          stale: false,
        }),
      }),
      documentRef: document,
      navigatorRef: {
        clipboard: {
          writeText: async (value) => {
            clipboardWrites.push(value);
          },
        },
      },
      setTimeoutFn: (cb) => cb(),
    });

    await component.openPrJsonModal({ prNumber: 101 }, { number: 101 });

    const diffMeta = String(document.querySelector(".pr-json-diff-meta")?.textContent || "");
    expect(diffMeta).toContain("files");
    expect(document.querySelector(".pr-json-diff-file-block")).toBeTruthy();

    const copyAllButton = document.querySelector(".pr-json-modal-copy-btn");
    expect(copyAllButton?.disabled).toBe(false);
    copyAllButton?.dispatchEvent(new MouseEvent("click"));

    await Promise.resolve();
    expect(clipboardWrites.length).toBe(1);
    expect(String(clipboardWrites[0] || "")).toContain("PR JSON Details for AI Review");
  });
});
