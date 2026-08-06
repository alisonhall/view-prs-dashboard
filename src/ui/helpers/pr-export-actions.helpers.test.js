const {
  createPrExportActionsHelpers,
} = require("./pr-export-actions.helpers.js");

describe("pr export actions helpers", () => {
  test("given preview node and export payload, when preview action runs, then preview content and status are updated", async () => {
    const previewNode = { textContent: "" };
    const persistExportFieldSelections = jest.fn(async () => {});
    const setExportStatus = jest.fn();

    const { handlePreviewExport } = createPrExportActionsHelpers({
      getOptionalElementById: (id) => (id === "export-preview" ? previewNode : null),
      persistExportFieldSelections,
      buildVisibleExportJson: () => ({
        jsonText: '{"ok":true}',
        exportPayload: { prCount: 2 },
      }),
      setExportStatus,
    });

    await handlePreviewExport();

    expect(persistExportFieldSelections).toHaveBeenCalledTimes(1);
    expect(previewNode.textContent).toBe('{"ok":true}');
    expect(setExportStatus).toHaveBeenCalledWith(
      "Prepared export JSON for 2 visible PRs.",
    );
  });

  test("given preview build failure, when preview action runs, then failure status is shown", async () => {
    const setExportStatus = jest.fn();
    const { handlePreviewExport } = createPrExportActionsHelpers({
      getOptionalElementById: () => ({ textContent: "" }),
      persistExportFieldSelections: async () => {},
      buildVisibleExportJson: () => {
        throw new Error("Select at least one field before exporting.");
      },
      setExportStatus,
    });

    await handlePreviewExport();

    expect(setExportStatus).toHaveBeenCalledWith(
      "Select at least one field before exporting.",
    );
  });

  test("given clipboard API is unavailable, when copy action runs, then clipboard error status is shown", async () => {
    const setExportStatus = jest.fn();
    const { handleCopyExport } = createPrExportActionsHelpers({
      persistExportFieldSelections: async () => {},
      buildVisibleExportJson: () => ({
        jsonText: '{"ok":true}',
        exportPayload: { prCount: 1 },
      }),
      hasClipboardWriteText: () => false,
      setExportStatus,
    });

    await handleCopyExport();

    expect(setExportStatus).toHaveBeenCalledWith(
      "Clipboard API not available in this browser.",
    );
  });

  test("given clipboard API is available, when copy action runs, then clipboard write and success status are emitted", async () => {
    const setExportStatus = jest.fn();
    const writeClipboardText = jest.fn(async () => {});
    const { handleCopyExport } = createPrExportActionsHelpers({
      persistExportFieldSelections: async () => {},
      buildVisibleExportJson: () => ({
        jsonText: '{"ok":true}',
        exportPayload: { prCount: 1 },
      }),
      hasClipboardWriteText: () => true,
      writeClipboardText,
      setExportStatus,
    });

    await handleCopyExport();

    expect(writeClipboardText).toHaveBeenCalledWith('{"ok":true}');
    expect(setExportStatus).toHaveBeenCalledWith(
      "Copied export JSON for 1 visible PR.",
    );
  });

  test("given download support and payload, when download action runs, then blob/url/anchor lifecycle and success status are emitted", async () => {
    const setExportStatus = jest.fn();
    const createBlob = jest.fn((text) => ({ text }));
    const createObjectUrl = jest.fn(() => "blob:export");
    const revokeObjectUrl = jest.fn();
    const appendDownloadAnchor = jest.fn();
    const triggerDownloadAnchor = jest.fn();
    const removeDownloadAnchor = jest.fn();
    const anchor = { href: "", download: "" };

    const { handleDownloadExport } = createPrExportActionsHelpers({
      persistExportFieldSelections: async () => {},
      buildVisibleExportJson: () => ({
        jsonText: '{"ok":true}',
        exportPayload: { prCount: 3 },
      }),
      setExportStatus,
      isDownloadSupported: () => true,
      createBlob,
      createObjectUrl,
      revokeObjectUrl,
      createDownloadAnchor: jest.fn((href, download) => ({
        ...anchor,
        href,
        download,
      })),
      appendDownloadAnchor,
      triggerDownloadAnchor,
      removeDownloadAnchor,
      getLatestStoredPayload: () => ({ lastRun: { repo: "Org/My Repo" } }),
      getLatestSelectedRepo: () => "fallback/repo",
      getCurrentIsoTimestamp: () => "2026-07-20T10:20:30.000Z",
    });

    await handleDownloadExport();

    expect(createBlob).toHaveBeenCalledWith('{"ok":true}');
    expect(createObjectUrl).toHaveBeenCalledWith({ text: '{"ok":true}' });
    expect(appendDownloadAnchor).toHaveBeenCalled();
    expect(triggerDownloadAnchor).toHaveBeenCalled();
    expect(removeDownloadAnchor).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:export");
    expect(setExportStatus).toHaveBeenCalledWith(
      "Downloaded export JSON for 3 visible PRs.",
    );
  });

  test("given repo and timestamp, when formatting download file name, then sanitized deterministic filename is returned", () => {
    const { formatExportDownloadFileName } = createPrExportActionsHelpers({
      getLatestSelectedRepo: () => "fallback/repo",
      getCurrentIsoTimestamp: () => "2026-07-20T10:20:30.000Z",
    });

    const fileName = formatExportDownloadFileName({
      lastRun: { repo: "Org/My Repo" },
    });

    expect(fileName).toBe(
      "view-prs-export-org-my-repo-2026-07-20T10-20-30-000Z.json",
    );
  });
});
