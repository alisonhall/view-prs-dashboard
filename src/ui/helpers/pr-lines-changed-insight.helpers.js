(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsLinesChangedInsightHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrLinesChangedInsightHelpers = ({
    toCount,
    documentRef,
  } = {}) => {
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number.parseInt(String(value ?? "").trim(), 10);
            return Number.isFinite(parsed) ? parsed : 0;
          };

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createLinesChangedInsightContent = (row = {}) => {
      const rawAdditions = String(row?.additions ?? "").trim();
      const rawDeletions = String(row?.deletions ?? "").trim();
      const hasLineChangeCounts = rawAdditions !== "" && rawDeletions !== "";
      if (!hasLineChangeCounts) {
        return "-";
      }

      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return "-";
      }

      const additionsCount = toCountSafe(rawAdditions);
      const deletionsCount = toCountSafe(rawDeletions);
      const totalLinesChanged = additionsCount + deletionsCount;
      const changedFilesCount = toCountSafe(row?.changedFilesCount);
      const changedFilesLabel = `${changedFilesCount} file${changedFilesCount === 1 ? "" : "s"} changed`;

      const container = doc.createElement("span");
      container.className = "insight-line-changes";

      const files = doc.createElement("span");
      files.className = "insight-line-changes-files";
      files.textContent = changedFilesLabel;
      container.appendChild(files);

      container.appendChild(doc.createTextNode(", "));

      const additions = doc.createElement("span");
      additions.className = "insight-line-changes-additions";
      additions.textContent = `+${additionsCount} additions`;
      container.appendChild(additions);

      container.appendChild(doc.createTextNode(", "));

      const deletions = doc.createElement("span");
      deletions.className = "insight-line-changes-deletions";
      deletions.textContent = `-${deletionsCount} deletions`;
      container.appendChild(deletions);

      container.appendChild(doc.createTextNode(" ("));

      const total = doc.createElement("span");
      total.className = "insight-line-changes-total";
      total.textContent = `${totalLinesChanged} lines changed`;
      container.appendChild(total);

      container.appendChild(doc.createTextNode(")"));

      return container;
    };

    return {
      createLinesChangedInsightContent,
    };
  };

  return {
    createPrLinesChangedInsightHelpers,
  };
});
