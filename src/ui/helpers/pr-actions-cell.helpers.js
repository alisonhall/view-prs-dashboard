(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActionsCellHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActionsCellHelpers = ({
    createInReviewControl,
    createFlaggedControl,
    runSinglePrUpdate,
    runAckOnlyWorkflow,
    runClearOnlyWorkflow,
    openPrJsonModal,
    getLatestSelectedRepo,
    defaultRepo,
    documentRef,
  } = {}) => {
    const createInReviewControlSafe =
      typeof createInReviewControl === "function"
        ? createInReviewControl
        : () => null;
    const createFlaggedControlSafe =
      typeof createFlaggedControl === "function" ? createFlaggedControl : () => null;
    const runSinglePrUpdateSafe =
      typeof runSinglePrUpdate === "function" ? runSinglePrUpdate : async () => {};
    const runAckOnlyWorkflowSafe =
      typeof runAckOnlyWorkflow === "function" ? runAckOnlyWorkflow : async () => {};
    const runClearOnlyWorkflowSafe =
      typeof runClearOnlyWorkflow === "function"
        ? runClearOnlyWorkflow
        : async () => {};
    const openPrJsonModalSafe =
      typeof openPrJsonModal === "function" ? openPrJsonModal : () => {};
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function" ? getLatestSelectedRepo : () => "";

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createActionsCell = (entry, row) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const td = doc.createElement("td");
      td.className = "actions-cell";

      const prNumber = String(row?.number || entry?.prNumber || "");
      const repo = entry?.repo || getLatestSelectedRepoSafe() || defaultRepo || "";

      const container = doc.createElement("div");
      container.className = "row-actions";

      const inReviewControl = createInReviewControlSafe(entry, row);
      if (inReviewControl) {
        container.appendChild(inReviewControl);
      }

      const flaggedControl = createFlaggedControlSafe(entry, row);
      if (flaggedControl) {
        container.appendChild(flaggedControl);
      }

      const makeBtn = (label, className, onClick) => {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.className = `row-action-btn ${className}`;
        btn.onclick = onClick;
        return btn;
      };

      container.appendChild(
        makeBtn("↻ Update", "update", async () => {
          await runSinglePrUpdateSafe(entry, row);
        }),
      );
      container.appendChild(
        makeBtn("✓ Ack", "ack", async () => {
          await runAckOnlyWorkflowSafe(prNumber, repo);
        }),
      );
      container.appendChild(
        makeBtn("✕ Clear", "clear", async () => {
          await runClearOnlyWorkflowSafe(prNumber, repo);
        }),
      );
      const detailsBtn = makeBtn("{}", "view-json", () => {
        openPrJsonModalSafe(entry, row);
      });
      detailsBtn.title = "View PR JSON details (data + pr-details + user-state)";
      detailsBtn.setAttribute("aria-label", `View PR JSON details for #${prNumber}`);
      container.appendChild(detailsBtn);

      td.appendChild(container);
      return td;
    };

    return {
      createActionsCell,
    };
  };

  return {
    createPrActionsCellHelpers,
  };
});
