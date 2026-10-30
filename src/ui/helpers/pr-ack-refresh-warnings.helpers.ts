// Summarizes the per-PR refresh problems an ack/label action reported
// (useAckLabelActions): skipped vs failed counts and a few sample lines.
// null when there were none.
export interface AckRefreshError {
  prNumber?: string | number;
  error?: string;
}

export interface AckRefreshWarningsSummary {
  skippedCount: number;
  failedCount: number;
  summaryText: string;
  sample: string;
}

export const summarizeAckRefreshWarnings = (
  refreshErrors: unknown = [],
  maxSampleItems: number = 5,
): AckRefreshWarningsSummary | null => {
  const normalizedErrors: AckRefreshError[] = Array.isArray(refreshErrors)
    ? refreshErrors.filter((entry): entry is AckRefreshError => Boolean(entry) && typeof entry === "object")
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

  const summaryParts: string[] = [];
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
