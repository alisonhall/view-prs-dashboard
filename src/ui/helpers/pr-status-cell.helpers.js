(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsStatusCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrStatusCellHelpers = ({
    isChangedStatus,
    statusClass,
    getViewedFilesState,
    buildPrLastCheckedIndicator,
    documentRef,
  } = {}) => {
    const isChangedStatusSafe =
      typeof isChangedStatus === "function" ? isChangedStatus : () => false;
    const statusClassSafe =
      typeof statusClass === "function" ? statusClass : () => "";
    const getViewedFilesStateSafe =
      typeof getViewedFilesState === "function"
        ? getViewedFilesState
        : () => ({
            viewedFilesCount: 0,
            changedFilesCount: 0,
            isComplete: false,
            hasUnviewedFiles: false,
          });
    const buildPrLastCheckedIndicatorSafe =
      typeof buildPrLastCheckedIndicator === "function"
        ? buildPrLastCheckedIndicator
        : () => ({ label: "", title: "", isStale: false });

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createStatusCell = (row, { lastCheckedAt = "", sectionKey = "" } = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      const statusText =
        row.reason && row.reason !== "-" && isChangedStatusSafe(row.status)
          ? `${row.status}(${row.reason})`
          : row.status || "-";

      td.className = ["status-cell", statusClassSafe(row.status)]
        .filter(Boolean)
        .join(" ");

      const statusCellContent = doc.createElement("div");
      statusCellContent.className = "status-cell-content";

      const summary = doc.createElement("div");
      summary.textContent = statusText;
      statusCellContent.appendChild(summary);

      const viewedFiles = doc.createElement("div");
      viewedFiles.className = "approved-cell-detail";
      const viewedFilesState = getViewedFilesStateSafe(row);
      const viewedProgress = doc.createElement("span");
      viewedProgress.className = [
        "approved-viewed-progress",
        viewedFilesState.hasUnviewedFiles
          ? "approved-viewed-progress-incomplete"
          : viewedFilesState.isComplete
            ? "approved-viewed-progress-complete"
            : "",
      ]
        .filter(Boolean)
        .join(" ");
      viewedProgress.textContent = `${viewedFilesState.viewedFilesCount}/${viewedFilesState.changedFilesCount}`;
      viewedFiles.appendChild(viewedProgress);
      const viewedLabel = doc.createElement("span");
      viewedLabel.textContent = " viewed";
      viewedFiles.appendChild(viewedLabel);
      statusCellContent.appendChild(viewedFiles);

      const lastCheckedIndicator = doc.createElement("span");
      lastCheckedIndicator.className = "pr-last-checked-indicator";
      const lastChecked = buildPrLastCheckedIndicatorSafe({
        updatedAt: lastCheckedAt,
        sectionKey,
      });
      lastCheckedIndicator.textContent = lastChecked.label;
      if (lastChecked.title) {
        lastCheckedIndicator.title = lastChecked.title;
      }
      if (lastChecked.isStale) {
        lastCheckedIndicator.classList.add("pr-last-checked-indicator-stale");
      }
      statusCellContent.appendChild(lastCheckedIndicator);

      td.appendChild(statusCellContent);

      return td;
    };

    return {
      createStatusCell,
    };
  };

  return {
    createPrStatusCellHelpers,
  };
});
