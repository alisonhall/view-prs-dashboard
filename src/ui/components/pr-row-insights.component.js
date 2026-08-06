(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRowInsightsComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRowInsightsComponent = ({
    parseMarkerState,
    formatIsoDatetime,
    buildRowActorsMap,
    formatApproversDisplay,
    formatRequestedReviewersDisplay,
    formatAssignedUsersDisplay,
    normalizeRowMetrics,
    getOpenConversationCountWithMe,
    toCount,
    getViewedFilesSummary,
    createLinesChangedInsightContent,
    buildActivityTimelineSummary,
    getBadgeClassForStatus,
    getBadgeClassForCheck,
    getBadgeClassForMerge,
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
    createActivityEventsSection,
    createReviewThreadsSection,
    createApprovalRiskSection,
    createNotesSection,
    documentRef,
  } = {}) => {
    const parseMarkerStateSafe =
      typeof parseMarkerState === "function" ? parseMarkerState : () => "-";
    const formatIsoDatetimeSafe =
      typeof formatIsoDatetime === "function" ? formatIsoDatetime : (value) => String(value || "-");
    const buildRowActorsMapSafe =
      typeof buildRowActorsMap === "function" ? buildRowActorsMap : () => ({});
    const formatApproversDisplaySafe =
      typeof formatApproversDisplay === "function" ? formatApproversDisplay : () => "-";
    const formatRequestedReviewersDisplaySafe =
      typeof formatRequestedReviewersDisplay === "function"
        ? formatRequestedReviewersDisplay
        : () => "-";
    const formatAssignedUsersDisplaySafe =
      typeof formatAssignedUsersDisplay === "function"
        ? formatAssignedUsersDisplay
        : () => "-";
    const normalizeRowMetricsSafe =
      typeof normalizeRowMetrics === "function" ? normalizeRowMetrics : () => ({});
    const getOpenConversationCountWithMeSafe =
      typeof getOpenConversationCountWithMe === "function"
        ? getOpenConversationCountWithMe
        : () => ({ count: 0, isViewerSpecific: false });
    const toCountSafe = typeof toCount === "function" ? toCount : () => 0;
    const getViewedFilesSummarySafe =
      typeof getViewedFilesSummary === "function" ? getViewedFilesSummary : () => "0/0 viewed";
    const createLinesChangedInsightContentSafe =
      typeof createLinesChangedInsightContent === "function"
        ? createLinesChangedInsightContent
        : () => "-";
    const buildActivityTimelineSummarySafe =
      typeof buildActivityTimelineSummary === "function"
        ? buildActivityTimelineSummary
        : () => "-";
    const getBadgeClassForStatusSafe =
      typeof getBadgeClassForStatus === "function" ? getBadgeClassForStatus : () => "";
    const getBadgeClassForCheckSafe =
      typeof getBadgeClassForCheck === "function" ? getBadgeClassForCheck : () => "";
    const getBadgeClassForMergeSafe =
      typeof getBadgeClassForMerge === "function" ? getBadgeClassForMerge : () => "";
    const formatReviewFootprintSafe =
      typeof formatReviewFootprint === "function" ? formatReviewFootprint : () => "-";
    const formatConversationStatusSafe =
      typeof formatConversationStatus === "function" ? formatConversationStatus : () => "-";
    const formatApprovalRiskSafe =
      typeof formatApprovalRisk === "function" ? formatApprovalRisk : () => "-";
    const formatCommentUsefulnessSafe =
      typeof formatCommentUsefulness === "function" ? formatCommentUsefulness : () => "-";
    const createActivityEventsSectionSafe =
      typeof createActivityEventsSection === "function" ? createActivityEventsSection : () => null;
    const createReviewThreadsSectionSafe =
      typeof createReviewThreadsSection === "function" ? createReviewThreadsSection : () => null;
    const createApprovalRiskSectionSafe =
      typeof createApprovalRiskSection === "function" ? createApprovalRiskSection : () => null;
    const createNotesSectionSafe =
      typeof createNotesSection === "function" ? createNotesSection : () => null;

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const createInsightsDetails = (entry, row, actorsMapFromPayload = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const details = doc.createElement("div");
      details.className = "row-insights-content";
      details.setAttribute("data-pr-number", String(row?.number || ""));

      const badges = doc.createElement("div");
      badges.className = "insight-badges";

      const grid = doc.createElement("div");
      grid.className = "insight-grid";

      const appendInsight = (label, value, labelTitle = "") => {
        const key = doc.createElement("span");
        key.className = "insight-key";
        key.textContent = label;
        if (labelTitle) {
          key.title = labelTitle;
        }
        grid.appendChild(key);

        const val = doc.createElement("span");
        val.className = "insight-value";
        const isNodeLike =
          value &&
          typeof value === "object" &&
          (typeof value.nodeType === "number" ||
            typeof value.appendChild === "function");
        if (isNodeLike) {
          val.appendChild(value);
        } else {
          val.textContent = value;
        }
        grid.appendChild(val);
      };

      const checkState = String(
        row.checkState || parseMarkerStateSafe(row.titleDisplay, "CHK") || "-",
      );
      const mergeState = String(
        row.mergeState || parseMarkerStateSafe(row.titleDisplay, "MRG") || "-",
      );
      const statusState = String(row.status || "-").toUpperCase();
      const latestDataTimestamp = formatIsoDatetimeSafe(row.sourceUpdatedAt || "-");
      const lastCheckedForUpdatesAt = formatIsoDatetimeSafe(entry?.updatedAt || "-");
      const baseline = formatIsoDatetimeSafe(row.baseline || "-");
      const actorsMap = buildRowActorsMapSafe(row, actorsMapFromPayload);
      const approversDisplay = formatApproversDisplaySafe(row, actorsMap);
      const requestedReviewersDisplay = formatRequestedReviewersDisplaySafe(
        row,
        actorsMap,
      );
      const assignedUsersDisplay = formatAssignedUsersDisplaySafe(row, actorsMap);
      const metrics = normalizeRowMetricsSafe(row);
      const openConversationCountWithMeResult = getOpenConversationCountWithMeSafe(row);
      const openConversationCountWithMe = String(
        toCountSafe(openConversationCountWithMeResult?.count),
      );
      const viewedFilesSummary = getViewedFilesSummarySafe(row);
      const linesChangedSummary = createLinesChangedInsightContentSafe(row);
      const isOpen = !String(row.mergedAt || "").trim();

      const activityTimelineSummary = buildActivityTimelineSummarySafe(
        row.activityTimeline,
        row.activityTimelineSummary,
        isOpen,
        row,
        actorsMap,
      );

      const appendBadge = (text, className) => {
        const chip = doc.createElement("span");
        chip.className = `insight-badge ${className}`.trim();
        chip.textContent = text;
        badges.appendChild(chip);
      };

      appendBadge(`STATUS: ${statusState}`, getBadgeClassForStatusSafe(statusState));
      appendBadge(`CHK: ${checkState}`, getBadgeClassForCheckSafe(checkState));
      appendBadge(`MRG: ${mergeState}`, getBadgeClassForMergeSafe(mergeState));

      details.appendChild(badges);

      appendInsight("Source branch", String(row.sourceBranch || "-"));
      appendInsight("Merged to", String(row.targetBranch || "-"));
      appendInsight("CHK state", checkState);
      appendInsight("Mergeability", mergeState);
      appendInsight("Approvers", approversDisplay);
      appendInsight("Reviewers", requestedReviewersDisplay);
      appendInsight("Assigned", assignedUsersDisplay);
      appendInsight(
        openConversationCountWithMeResult?.isViewerSpecific
          ? "Open conversations with me"
          : "Open conversations",
        openConversationCountWithMe,
      );
      appendInsight("Viewed files", viewedFilesSummary);
      appendInsight("Lines changed", linesChangedSummary);
      appendInsight("Review footprint", formatReviewFootprintSafe(metrics));
      appendInsight("Conversation status", formatConversationStatusSafe(metrics));
      appendInsight("Approval risk", formatApprovalRiskSafe(metrics));
      appendInsight("Comment usefulness", formatCommentUsefulnessSafe(metrics));
      appendInsight("Activity timeline", activityTimelineSummary);
      appendInsight(
        "Latest data timestamp",
        latestDataTimestamp,
        "When source PR data (comments/reviews/threads/metadata) was last updated.",
      );
      appendInsight(
        "Last checked for updates",
        lastCheckedForUpdatesAt,
        "When this dashboard last evaluated the PR for new changes during a script run.",
      );
      appendInsight("Baseline", baseline);

      details.appendChild(grid);

      const activitySection = createActivityEventsSectionSafe(row, actorsMap);
      if (activitySection) {
        details.appendChild(activitySection);
      }

      const reviewThreadsSection = createReviewThreadsSectionSafe(row, actorsMap);
      if (reviewThreadsSection) {
        details.appendChild(reviewThreadsSection);
      }

      const approvalRiskSection = createApprovalRiskSectionSafe(
        row,
        metrics,
        actorsMap,
      );
      if (approvalRiskSection) {
        details.appendChild(approvalRiskSection);
      }

      const notesSection = createNotesSectionSafe(entry, row, actorsMap);
      if (notesSection) {
        details.appendChild(notesSection);
      }

      return details;
    };

    return {
      createInsightsDetails,
    };
  };

  return {
    createPrRowInsightsComponent,
  };
});
