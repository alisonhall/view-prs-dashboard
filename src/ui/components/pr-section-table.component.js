(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionTableComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionTableComponent = ({
    tableHeaders,
    tableColumnClasses,
    defaultRepo,
    getNeedsAttentionConfig,
    countPendingThreadComments,
    shouldShowNeedsAttention,
    isInReviewEnabled,
    isFlaggedEnabled,
    createSelectionCell,
    createStatusCell,
    createApprovedCell,
    createInsightsDetails,
    createTitleCell,
    createAuthorCell,
    createLabelsCell,
    createTextCell,
    createDateCell,
    createActionsCell,
    formatChkDisplay,
    createHeaderCell,
    documentRef,
  } = {}) => {
    const tableHeadersSafe = Array.isArray(tableHeaders) ? tableHeaders : [];
    const tableColumnClassesSafe = Array.isArray(tableColumnClasses)
      ? tableColumnClasses
      : [];
    const countPendingThreadCommentsSafe =
      typeof countPendingThreadComments === "function"
        ? countPendingThreadComments
        : () => 0;
    const shouldShowNeedsAttentionSafe =
      typeof shouldShowNeedsAttention === "function"
        ? shouldShowNeedsAttention
        : () => false;
    const isInReviewEnabledSafe =
      typeof isInReviewEnabled === "function" ? isInReviewEnabled : () => false;
    const isFlaggedEnabledSafe =
      typeof isFlaggedEnabled === "function" ? isFlaggedEnabled : () => false;
    const createSelectionCellSafe =
      typeof createSelectionCell === "function" ? createSelectionCell : () => null;
    const createStatusCellSafe =
      typeof createStatusCell === "function" ? createStatusCell : () => null;
    const createApprovedCellSafe =
      typeof createApprovedCell === "function" ? createApprovedCell : () => null;
    const createInsightsDetailsSafe =
      typeof createInsightsDetails === "function" ? createInsightsDetails : () => null;
    const createTitleCellSafe =
      typeof createTitleCell === "function" ? createTitleCell : () => null;
    const createAuthorCellSafe =
      typeof createAuthorCell === "function" ? createAuthorCell : () => null;
    const createLabelsCellSafe =
      typeof createLabelsCell === "function" ? createLabelsCell : () => null;
    const createTextCellSafe =
      typeof createTextCell === "function" ? createTextCell : () => null;
    const createDateCellSafe =
      typeof createDateCell === "function" ? createDateCell : () => null;
    const createActionsCellSafe =
      typeof createActionsCell === "function" ? createActionsCell : () => null;
    const formatChkDisplaySafe =
      typeof formatChkDisplay === "function" ? formatChkDisplay : (value) => String(value || "-");
    const createHeaderCellSafe =
      typeof createHeaderCell === "function" ? createHeaderCell : () => null;
    const getNeedsAttentionConfigSafe =
      typeof getNeedsAttentionConfig === "function" ? getNeedsAttentionConfig : () => ({});

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const appendIfNode = (parent, maybeNode) => {
      if (!parent || !maybeNode) return;
      parent.appendChild(maybeNode);
    };

    const buildSectionTable = (
      rows,
      dateHeader,
      dateResolver,
      sectionKey,
      lastCheckedAt = "",
      actorsMapFromPayload = {},
    ) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      if (!rows.length) {
        const none = doc.createElement("pre");
        none.textContent = "(none)";
        return none;
      }

      const table = doc.createElement("table");
      table.className = "pr-data-table";
      const columnCount = tableHeadersSafe.length;

      const colgroup = doc.createElement("colgroup");
      tableColumnClassesSafe.forEach((columnClass) => {
        const col = doc.createElement("col");
        col.className = columnClass;
        colgroup.appendChild(col);
      });
      table.appendChild(colgroup);

      const thead = doc.createElement("thead");
      const headRow = doc.createElement("tr");
      tableHeadersSafe.forEach((header, index) => {
        appendIfNode(headRow, createHeaderCellSafe(header, index, dateHeader));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = doc.createElement("tbody");
      const attentionConfig = getNeedsAttentionConfigSafe();
      for (const entry of rows) {
        const row = entry?.data || {};
        const rowLastCheckedAt =
          String(entry?.updatedAt || "").trim() ||
          String(row?.updatedAt || "").trim() ||
          String(lastCheckedAt || "").trim();
        const tr = doc.createElement("tr");

        appendIfNode(tr, createSelectionCellSafe(row));
        const attentionTd = doc.createElement("td");
        attentionTd.className = "attention-cell";
        const prTd = doc.createElement("td");
        prTd.className = "pr-number-cell";
        const prNumber = row.number || entry.prNumber || "";
        const hasPendingComments = countPendingThreadCommentsSafe(row) > 0;
        const needsAttention =
          shouldShowNeedsAttentionSafe({
            row,
            sectionKey,
            hasPendingComments,
            config: attentionConfig,
          }) || isInReviewEnabledSafe(row);
        const flagged = isFlaggedEnabledSafe(entry, row);
        if (needsAttention || flagged) {
          const attentionIcons = doc.createElement("div");
          attentionIcons.className = "attention-icons";

          if (needsAttention) {
            const attention = doc.createElement("span");
            attention.className = "attention-icon";
            attention.textContent = "⚠️";
            attention.title = hasPendingComments
              ? "Needs attention — has unsubmitted pending comments"
              : "Needs attention";
            attentionIcons.appendChild(attention);
          }

          if (flagged) {
            const flaggedIcon = doc.createElement("span");
            flaggedIcon.className = "flagged-icon";
            flaggedIcon.textContent = "🚩";
            flaggedIcon.title = "PR was flagged";
            attentionIcons.appendChild(flaggedIcon);
          }

          attentionTd.appendChild(attentionIcons);
        }
        tr.appendChild(attentionTd);
        const link = doc.createElement("a");
        link.className = "pr-link";
        link.textContent = `#${prNumber}`;
        link.href =
          row.url ||
          `https://github.com/${entry.repo || defaultRepo || ""}/pull/${prNumber}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const progressIndicator = doc.createElement("span");
        progressIndicator.className = "pr-progress-indicator";
        progressIndicator.hidden = true;
        progressIndicator.title = `PR #${prNumber} update in progress`;
        progressIndicator.setAttribute("aria-hidden", "true");

        const prCellTop = doc.createElement("span");
        prCellTop.className = "pr-number-cell-top";
        prCellTop.appendChild(link);

        const prCellProgress = doc.createElement("span");
        prCellProgress.className = "pr-number-cell-progress";
        prCellProgress.appendChild(progressIndicator);

        const prCellContent = doc.createElement("div");
        prCellContent.className = "pr-number-cell-content";
        prCellContent.appendChild(prCellTop);
        prCellContent.appendChild(prCellProgress);

        prTd.setAttribute("data-pr-number", String(prNumber));
        prTd.appendChild(prCellContent);
        tr.appendChild(prTd);

        appendIfNode(
          tr,
          createStatusCellSafe(row, {
            lastCheckedAt: rowLastCheckedAt,
            sectionKey,
          }),
        );

        appendIfNode(tr, createApprovedCellSafe(row, actorsMapFromPayload));

        const insightsTr = doc.createElement("tr");
        insightsTr.hidden = true;
        const insightsTd = doc.createElement("td");
        insightsTd.className = "insights-row-cell";
        insightsTd.colSpan = columnCount;
        appendIfNode(
          insightsTd,
          createInsightsDetailsSafe(entry, row, actorsMapFromPayload),
        );
        insightsTr.appendChild(insightsTd);

        appendIfNode(tr, createTitleCellSafe(row, insightsTr));
        appendIfNode(tr, createAuthorCellSafe(entry, row, actorsMapFromPayload));
        appendIfNode(tr, createLabelsCellSafe(row.labels));
        appendIfNode(
          tr,
          createTextCellSafe(formatChkDisplaySafe(row.titleDisplay), "check-cell"),
        );
        appendIfNode(tr, createDateCellSafe(entry, row, dateResolver(row)));
        appendIfNode(tr, createActionsCellSafe(entry, row));
        tbody.appendChild(tr);
        tbody.appendChild(insightsTr);
      }

      table.appendChild(tbody);
      return table;
    };

    return {
      buildSectionTable,
    };
  };

  return {
    createPrSectionTableComponent,
  };
});
