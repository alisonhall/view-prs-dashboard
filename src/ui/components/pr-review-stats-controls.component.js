(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsControlsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsControlsComponent = ({
    statsViewState,
    toCount,
    markInputAsNonCredentialField,
    applyFiltersFromCache,
  } = {}) => {
    const refreshFromControlChange = () => {
      if (typeof applyFiltersFromCache === "function") {
        applyFiltersFromCache();
      }
    };

    const createStatsControls = () => {
      const controls = document.createElement("div");
      controls.className = "stats-controls";

      const sortLabel = document.createElement("label");
      sortLabel.textContent = "Sort by";
      const sortSelect = document.createElement("select");
      [
        ["riskyApprovals", "Risky approvals"],
        ["highRiskApprovals", "High-risk approvals"],
        ["approvals", "Approvals"],
        ["comments", "Comments on others' PRs"],
        ["usefulnessSignals", "Comment usefulness signals"],
        ["commentsFollowedByAuthorCommit", "Comments followed by author commit"],
        ["resolvedThreadComments", "Resolved thread comments"],
        ["reviews", "Reviews"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = statsViewState.sortBy === value;
        sortSelect.appendChild(option);
      });
      sortSelect.onchange = () => {
        statsViewState.sortBy = sortSelect.value;
        refreshFromControlChange();
      };
      sortLabel.appendChild(sortSelect);
      controls.appendChild(sortLabel);

      const modeLabel = document.createElement("label");
      modeLabel.textContent = "Filter";
      const modeSelect = document.createElement("select");
      [
        ["all", "All reviewers"],
        ["risky-only", "Only risky approvals"],
        ["high-risk-approvals", "Only high-risk approvals"],
        ["useful-comments", "Only useful-comment signals"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = statsViewState.filterMode === value;
        modeSelect.appendChild(option);
      });
      modeSelect.onchange = () => {
        statsViewState.filterMode = modeSelect.value;
        refreshFromControlChange();
      };
      modeLabel.appendChild(modeSelect);
      controls.appendChild(modeLabel);

      const minCommentsLabel = document.createElement("label");
      minCommentsLabel.textContent = "Min comments";
      const minCommentsInput = document.createElement("input");
      minCommentsInput.type = "number";
      minCommentsInput.min = "0";
      minCommentsInput.value = String(statsViewState.minComments);
      minCommentsInput.onchange = () => {
        statsViewState.minComments = Math.max(0, toCount(minCommentsInput.value));
        refreshFromControlChange();
      };
      minCommentsLabel.appendChild(minCommentsInput);
      controls.appendChild(minCommentsLabel);

      const topNLabel = document.createElement("label");
      topNLabel.textContent = "Top reviewers";
      const topNInput = document.createElement("input");
      topNInput.type = "number";
      topNInput.min = "1";
      topNInput.value = String(statsViewState.topN);
      topNInput.onchange = () => {
        statsViewState.topN = Math.max(1, toCount(topNInput.value) || 12);
        refreshFromControlChange();
      };
      topNLabel.appendChild(topNInput);
      controls.appendChild(topNLabel);

      const startDateLabel = document.createElement("label");
      startDateLabel.textContent = "Start date";
      const startDateInput = document.createElement("input");
      startDateInput.type = "date";
      markInputAsNonCredentialField(startDateInput, "review-stats-start-date");
      startDateInput.value = String(statsViewState.startDate || "");
      startDateInput.onchange = () => {
        try {
          statsViewState.startDate = String(startDateInput.value || "").trim();
          refreshFromControlChange();
        } catch (error) {
          console.error("Error updating start date filter:", error);
        }
      };
      startDateLabel.appendChild(startDateInput);
      controls.appendChild(startDateLabel);

      const endDateLabel = document.createElement("label");
      endDateLabel.textContent = "End date";
      const endDateInput = document.createElement("input");
      endDateInput.type = "date";
      markInputAsNonCredentialField(endDateInput, "review-stats-end-date");
      endDateInput.value = String(statsViewState.endDate || "");
      endDateInput.onchange = () => {
        try {
          statsViewState.endDate = String(endDateInput.value || "").trim();
          refreshFromControlChange();
        } catch (error) {
          console.error("Error updating end date filter:", error);
        }
      };
      endDateLabel.appendChild(endDateInput);
      controls.appendChild(endDateLabel);

      return controls;
    };

    return {
      createStatsControls,
    };
  };

  return {
    createPrReviewStatsControlsComponent,
  };
});
