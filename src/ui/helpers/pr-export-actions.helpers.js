(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsExportActionsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrExportActionsHelpers = ({
    getOptionalElementById,
    persistExportFieldSelections,
    buildVisibleExportJson,
    setExportStatus,
    getLatestStoredPayload,
    getLatestSelectedRepo,
    getCurrentIsoTimestamp,
    hasClipboardWriteText,
    writeClipboardText,
    isDownloadSupported,
    createBlob,
    createObjectUrl,
    revokeObjectUrl,
    createDownloadAnchor,
    appendDownloadAnchor,
    triggerDownloadAnchor,
    removeDownloadAnchor,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const persistExportFieldSelectionsSafe =
      typeof persistExportFieldSelections === "function"
        ? persistExportFieldSelections
        : async () => {};
    const buildVisibleExportJsonSafe =
      typeof buildVisibleExportJson === "function"
        ? buildVisibleExportJson
        : () => ({ jsonText: "{}", exportPayload: { prCount: 0 } });
    const setExportStatusSafe =
      typeof setExportStatus === "function" ? setExportStatus : () => {};
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function"
        ? getLatestStoredPayload
        : () => ({});
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function"
        ? getLatestSelectedRepo
        : () => "";
    const getCurrentIsoTimestampSafe =
      typeof getCurrentIsoTimestamp === "function"
        ? getCurrentIsoTimestamp
        : () => new Date().toISOString();
    const hasClipboardWriteTextSafe =
      typeof hasClipboardWriteText === "function"
        ? hasClipboardWriteText
        : () => Boolean(globalThis?.navigator?.clipboard?.writeText);
    const writeClipboardTextSafe =
      typeof writeClipboardText === "function"
        ? writeClipboardText
        : (value) => globalThis?.navigator?.clipboard?.writeText?.(value);
    const isDownloadSupportedSafe =
      typeof isDownloadSupported === "function"
        ? isDownloadSupported
        : () =>
            typeof globalThis?.Blob !== "undefined" &&
            Boolean(globalThis?.window?.URL?.createObjectURL);
    const createBlobSafe =
      typeof createBlob === "function"
        ? createBlob
        : (jsonText) => new globalThis.Blob([jsonText], { type: "application/json" });
    const createObjectUrlSafe =
      typeof createObjectUrl === "function"
        ? createObjectUrl
        : (blob) => globalThis?.window?.URL?.createObjectURL?.(blob);
    const revokeObjectUrlSafe =
      typeof revokeObjectUrl === "function"
        ? revokeObjectUrl
        : (url) => globalThis?.window?.URL?.revokeObjectURL?.(url);
    const createDownloadAnchorSafe =
      typeof createDownloadAnchor === "function"
        ? createDownloadAnchor
        : (href, fileName) => {
            const anchor = globalThis?.document?.createElement?.("a");
            if (!anchor) {
              return null;
            }
            anchor.href = href;
            anchor.download = fileName;
            anchor.style.display = "none";
            return anchor;
          };
    const appendDownloadAnchorSafe =
      typeof appendDownloadAnchor === "function"
        ? appendDownloadAnchor
        : (anchor) => {
            globalThis?.document?.body?.appendChild?.(anchor);
          };
    const triggerDownloadAnchorSafe =
      typeof triggerDownloadAnchor === "function"
        ? triggerDownloadAnchor
        : (anchor) => {
            if (typeof anchor?.click === "function") {
              anchor.click();
            }
          };
    const removeDownloadAnchorSafe =
      typeof removeDownloadAnchor === "function"
        ? removeDownloadAnchor
        : (anchor) => {
            if (typeof anchor?.remove === "function") {
              anchor.remove();
            }
          };

    const toErrorMessage = (error, fallback) =>
      String(error?.message || error || fallback);

    const formatExportDownloadFileName = (payload = {}) => {
      const repo = String(
        payload?.lastRun?.repo || getLatestSelectedRepoSafe() || "all-repos",
      )
        .trim()
        .replace(/[^a-z0-9_.-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      const stamp = String(getCurrentIsoTimestampSafe() || "")
        .replace(/[:.]/g, "-")
        .trim();
      return `view-prs-export-${repo || "all-repos"}-${stamp}.json`;
    };

    const handlePreviewExport = async () => {
      const previewNode = getOptionalElementByIdSafe("export-preview");
      if (!previewNode) {
        return;
      }

      await persistExportFieldSelectionsSafe();

      try {
        const { jsonText, exportPayload } = buildVisibleExportJsonSafe();
        previewNode.textContent = jsonText;
        setExportStatusSafe(
          `Prepared export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        setExportStatusSafe(toErrorMessage(error, "Failed to build export JSON."));
      }
    };

    const handleCopyExport = async () => {
      await persistExportFieldSelectionsSafe();

      try {
        const { jsonText, exportPayload } = buildVisibleExportJsonSafe();
        if (!hasClipboardWriteTextSafe()) {
          throw new Error("Clipboard API not available in this browser.");
        }
        await writeClipboardTextSafe(jsonText);
        setExportStatusSafe(
          `Copied export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        setExportStatusSafe(toErrorMessage(error, "Copy failed."));
      }
    };

    const handleDownloadExport = async () => {
      await persistExportFieldSelectionsSafe();

      let objectUrl = "";
      let anchor = null;
      try {
        const { jsonText, exportPayload } = buildVisibleExportJsonSafe();
        if (!isDownloadSupportedSafe()) {
          throw new Error("Download is not supported in this browser.");
        }

        const blob = createBlobSafe(jsonText);
        objectUrl = String(createObjectUrlSafe(blob) || "");
        anchor = createDownloadAnchorSafe(
          objectUrl,
          formatExportDownloadFileName(getLatestStoredPayloadSafe() || {}),
        );
        if (anchor) {
          appendDownloadAnchorSafe(anchor);
          triggerDownloadAnchorSafe(anchor);
        }

        setExportStatusSafe(
          `Downloaded export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        setExportStatusSafe(toErrorMessage(error, "Download failed."));
      } finally {
        if (anchor) {
          removeDownloadAnchorSafe(anchor);
        }
        if (objectUrl) {
          revokeObjectUrlSafe(objectUrl);
        }
      }
    };

    return {
      formatExportDownloadFileName,
      handlePreviewExport,
      handleCopyExport,
      handleDownloadExport,
    };
  };

  return {
    createPrExportActionsHelpers,
  };
});
