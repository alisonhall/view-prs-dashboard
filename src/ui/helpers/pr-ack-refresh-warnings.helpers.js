// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// moved out of index.page.js, which only published it as
// window.summarizeAckRefreshWarnings for useAckLabelActions.jsx. Genuinely
// pure, so a bare export (pr-failure-snackbar.helpers.js's precedent) that
// the hook imports directly.

export const summarizeAckRefreshWarnings = (
  refreshErrors = [],
  maxSampleItems = 5,
) => {
  const normalizedErrors = Array.isArray(refreshErrors)
    ? refreshErrors.filter((entry) => entry && typeof entry === "object")
    : [];

  if (normalizedErrors.length === 0) {
    return null;
  }

  const skippedCount = normalizedErrors.filter((entry) =>
    String(entry?.error || "")
      .trim()
      .toLowerCase()
      .startsWith("skipped:"),
  ).length;
  const failedCount = Math.max(0, normalizedErrors.length - skippedCount);
  const sample = normalizedErrors
    .slice(0, Math.max(1, Number(maxSampleItems) || 5))
    .map((entry) => {
      const pr = String(entry?.prNumber || "?").trim();
      const reason = String(entry?.error || "").trim() || "Refresh issue";
      return `#${pr}: ${reason}`;
    })
    .join("\n");

  const summaryParts = [];
  if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
  if (failedCount > 0) summaryParts.push(`${failedCount} failed`);

  return {
    skippedCount,
    failedCount,
    summaryText:
      summaryParts.join(", ") || `${normalizedErrors.length} issue(s)`,
    sample,
  };
};
