(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionShellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionShellHelpers = ({
    getNeedsAttentionConfig,
    countPendingThreadComments,
    shouldShowNeedsAttention,
    buildSectionTable,
    documentRef,
  } = {}) => {
    const getNeedsAttentionConfigSafe =
      typeof getNeedsAttentionConfig === "function"
        ? getNeedsAttentionConfig
        : () => ({});
    const countPendingThreadCommentsSafe =
      typeof countPendingThreadComments === "function"
        ? countPendingThreadComments
        : () => 0;
    const shouldShowNeedsAttentionSafe =
      typeof shouldShowNeedsAttention === "function"
        ? shouldShowNeedsAttention
        : () => false;
    const buildSectionTableSafe =
      typeof buildSectionTable === "function" ? buildSectionTable : () => null;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const buildPrSection = ({
      title,
      rows,
      renderRows,
      dateHeader,
      dateResolver,
      sectionKey,
      lastCheckedAt = "",
      actorsMapFromPayload = {},
      isOpen = true,
      isSmartGroup = false,
    }) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      // `rows` drives the section's total/attention counts; `renderRows`
      // (defaulting to `rows` when not supplied) is the set of rows actually
      // rendered as table rows. These differ when a row is already shown in
      // a smart group above - it still counts here, but isn't rendered a
      // second time.
      const safeRows = Array.isArray(rows) ? rows : [];
      const safeRenderRows = Array.isArray(renderRows) ? renderRows : safeRows;
      const attentionConfig = getNeedsAttentionConfigSafe();
      const needsAttentionCount = safeRows.reduce((count, entry) => {
        const row = entry?.data || {};
        const hasPendingComments = countPendingThreadCommentsSafe(row) > 0;
        if (
          shouldShowNeedsAttentionSafe({
            row,
            sectionKey,
            hasPendingComments,
            config: attentionConfig,
          })
        ) {
          return count + 1;
        }
        return count;
      }, 0);

      const details = doc.createElement("details");
      details.className = `pr-group-section pr-group-section-${sectionKey}`;
      details.setAttribute("data-pr-section", sectionKey);
      details.open = isOpen;

      const summary = doc.createElement("summary");
      summary.className = "pr-group-section-summary";

      const titleNode = doc.createElement("span");
      titleNode.className = "pr-group-section-title";
      titleNode.textContent = title;

      const countsNode = doc.createElement("span");
      countsNode.className = "pr-group-section-counts";

      const countNode = doc.createElement("span");
      countNode.className = "pr-group-section-count";
      countNode.title = "Total PRs in section";
      countNode.textContent = `${safeRows.length}`;

      const attentionCountNode = doc.createElement("span");
      attentionCountNode.className = "pr-group-section-attention-count";
      attentionCountNode.title = "PRs marked as needs attention in this section";
      attentionCountNode.textContent = `Attention: ${needsAttentionCount}`;

      countsNode.appendChild(countNode);
      if (needsAttentionCount > 0) {
        countsNode.appendChild(attentionCountNode);
      }
      summary.appendChild(titleNode);
      summary.appendChild(countsNode);
      details.appendChild(summary);

      const content = doc.createElement("div");
      content.className = "pr-group-section-content";
      const table = buildSectionTableSafe(
        safeRenderRows,
        dateHeader,
        dateResolver,
        sectionKey,
        lastCheckedAt,
        actorsMapFromPayload,
        isSmartGroup,
      );
      if (table) {
        content.appendChild(table);
      }
      details.appendChild(content);

      return details;
    };

    return {
      buildPrSection,
    };
  };

  return {
    createPrSectionShellHelpers,
  };
});
