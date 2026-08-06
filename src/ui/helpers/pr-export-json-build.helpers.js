(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsExportJsonBuildHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrExportJsonBuildHelpers = ({
    getLatestStoredPayload,
    getSelectedExportFieldPaths,
    getOptionalElementById,
    getVisiblePrNumbersFromSectionsHost,
    buildExportPayload,
    safeJsonStringify,
  } = {}) => {
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function"
        ? getLatestStoredPayload
        : () => ({});
    const getSelectedExportFieldPathsSafe =
      typeof getSelectedExportFieldPaths === "function"
        ? getSelectedExportFieldPaths
        : () => ({ dataPaths: [], userStatePaths: [] });
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const getVisiblePrNumbersFromSectionsHostSafe =
      typeof getVisiblePrNumbersFromSectionsHost === "function"
        ? getVisiblePrNumbersFromSectionsHost
        : () => [];
    const buildExportPayloadSafe =
      typeof buildExportPayload === "function"
        ? buildExportPayload
        : () => ({ prCount: 0, prs: [] });
    const safeJsonStringifySafe =
      typeof safeJsonStringify === "function"
        ? safeJsonStringify
        : (value) => JSON.stringify(value, null, 2);

    const buildVisibleExportJson = () => {
      const payload = getLatestStoredPayloadSafe() || {};
      const selected = getSelectedExportFieldPathsSafe();
      const selectedDataPaths = Array.isArray(selected?.dataPaths)
        ? selected.dataPaths
        : [];
      const selectedUserStatePaths = Array.isArray(selected?.userStatePaths)
        ? selected.userStatePaths
        : [];

      if (selectedDataPaths.length + selectedUserStatePaths.length === 0) {
        throw new Error("Select at least one field before exporting.");
      }

      const sectionsHost = getOptionalElementByIdSafe("pr-sections");
      const visiblePrNumbers = getVisiblePrNumbersFromSectionsHostSafe(sectionsHost);
      const exportPayload = buildExportPayloadSafe({
        payload,
        visiblePrNumbers,
        selectedDataPaths,
        selectedUserStatePaths,
      });
      const jsonText = safeJsonStringifySafe(exportPayload);

      return {
        jsonText,
        exportPayload,
      };
    };

    return {
      buildVisibleExportJson,
    };
  };

  return {
    createPrExportJsonBuildHelpers,
  };
});
