(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsTitleCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrTitleCellHelpers = ({
    formatTitleWithIcons,
    autoResizeTextarea,
    countPendingThreadComments,
    documentRef,
  } = {}) => {
    const formatTitleWithIconsSafe =
      typeof formatTitleWithIcons === "function"
        ? formatTitleWithIcons
        : (_titleDisplay, title) => String(title || "");
    const autoResizeTextareaSafe =
      typeof autoResizeTextarea === "function" ? autoResizeTextarea : () => {};
    const countPendingThreadCommentsSafe =
      typeof countPendingThreadComments === "function"
        ? countPendingThreadComments
        : () => 0;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createTitleCell = (row, insightsRow) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "title-cell";

      const titleText = doc.createElement("div");
      titleText.className = "title-text";
      titleText.textContent = formatTitleWithIconsSafe(row?.titleDisplay, row?.title);
      td.appendChild(titleText);

      const targetBranch = String(row?.targetBranch || "").trim();
      if (targetBranch && targetBranch.toLowerCase() !== "main") {
        const targetBranchText = doc.createElement("div");
        targetBranchText.className = "insight-subtle";
        targetBranchText.textContent = `Target branch: ${targetBranch}`;
        td.appendChild(targetBranchText);
      }

      const toggleButton = doc.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "row-insights-toggle";
      toggleButton.textContent = "More insights";
      toggleButton.setAttribute("aria-expanded", "false");
      toggleButton.setAttribute("data-pr-number", String(row?.number || ""));
      toggleButton.onclick = () => {
        insightsRow.hidden = !insightsRow.hidden;
        const isExpanded = insightsRow.hidden === false;
        toggleButton.textContent = isExpanded ? "Hide insights" : "More insights";
        toggleButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        if (isExpanded && typeof insightsRow.querySelectorAll === "function") {
          insightsRow
            .querySelectorAll(".pr-notes-textarea")
            .forEach(autoResizeTextareaSafe);
        }
      };
      td.appendChild(toggleButton);

      const pendingCommentCount = countPendingThreadCommentsSafe(row);
      if (pendingCommentCount > 0) {
        const pendingChip = doc.createElement("span");
        pendingChip.className = "row-pending-comments-chip";
        pendingChip.textContent = `Pending comments: ${pendingCommentCount}`;
        pendingChip.title =
          "This PR has unsubmitted draft review comments that are not yet submitted.";
        td.appendChild(pendingChip);
      }

      return td;
    };

    return {
      createTitleCell,
    };
  };

  return {
    createPrTitleCellHelpers,
  };
});
