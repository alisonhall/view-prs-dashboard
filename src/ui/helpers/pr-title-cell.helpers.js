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

    /**
     * Create a lifecycle badge element for a PR in a smart group.
     * Only shows badges when PR is in a smart group section.
     *
     * @param {string} section - The lifecycle section (open/draft/closed/merged)
     * @param {boolean} isSmartGroup - Whether the PR is in a smart group
     * @returns {HTMLElement|null} Badge element or null
     */
    const createLifecycleBadge = (section, isSmartGroup) => {
      if (!isSmartGroup) return null;

      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const badges = {
        open: { text: "Open", className: "lifecycle-badge-open" },
        draft: { text: "Draft", className: "lifecycle-badge-draft" },
        closed: { text: "Closed", className: "lifecycle-badge-closed" },
        merged: { text: "Merged", className: "lifecycle-badge-merged" },
      };

      const badgeConfig = badges[String(section || "").toLowerCase()];
      if (!badgeConfig) return null;

      const badge = doc.createElement("span");
      badge.className = `lifecycle-badge ${badgeConfig.className}`;
      badge.textContent = badgeConfig.text;
      badge.title = `Lifecycle status: ${badgeConfig.text}`;

      return badge;
    };

    const createTitleCell = (row, insightsRow, sectionContext = null) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "title-cell";

      const titleText = doc.createElement("div");
      titleText.className = "title-text";
      titleText.textContent = formatTitleWithIconsSafe(row?.titleDisplay, row?.title);

      // Add lifecycle badge if in smart group
      // The lifecycle section is stored in sectionContext.lifecycleSection
      // (not row.section which doesn't exist, and not sectionContext.section which is the smart group key)
      const lifecycleBadge = createLifecycleBadge(
        sectionContext?.lifecycleSection,
        sectionContext?.isSmartGroup === true,
      );
      if (lifecycleBadge) {
        titleText.appendChild(doc.createTextNode(" "));
        titleText.appendChild(lifecycleBadge);
      }

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
      toggleButton.setAttribute("data-section-key", String(sectionContext?.section || ""));
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
      createLifecycleBadge,
    };
  };

  return {
    createPrTitleCellHelpers,
  };
});
