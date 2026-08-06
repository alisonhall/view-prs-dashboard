(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrJsonModalHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrJsonModalHelpers = ({ summarizeDiffText, safeJsonStringify }) => {
    const summarize =
      typeof summarizeDiffText === "function"
        ? summarizeDiffText
        : () => ({
            filesChanged: 0,
            additions: 0,
            deletions: 0,
            hunks: 0,
            lines: 0,
          });
    const stringify =
      typeof safeJsonStringify === "function"
        ? safeJsonStringify
        : (value) => JSON.stringify(value ?? null, null, 2);

    const formatDiffSummaryLine = (diffData) => {
      if (!diffData || diffData.ok === false) {
        return String(diffData?.error || "Diff data is unavailable");
      }

      const stats = summarize(diffData.diffText);
      const source = String(diffData.source || "").trim() || "unknown source";
      const freshness = diffData.stale ? "stale cache" : "current";
      const fetchedAt = diffData.fetchedAt ? ` fetched ${diffData.fetchedAt}` : "";
      return `${stats.filesChanged} files, +${stats.additions}/-${stats.deletions}, ${stats.hunks} hunks, ${stats.lines} lines, ${source}, ${freshness}${fetchedAt}`;
    };

    const buildPrJsonModalAiClipboardText = (detailsPayload, diffData) => {
      const payload = detailsPayload || {};
      const diff = diffData || {};
      const repo = String(payload.repo || "").trim() || "unknown";
      const prNumber = String(payload.prNumber || "").trim() || "unknown";
      const dataFile = payload.dataFile || {
        file: "check-open-pr-updates.data.json",
        entry: null,
      };
      const prDetailFile = payload.prDetailFile || {
        file: "data/pr-details/<repo>__pr-<number>.json",
        entry: null,
      };
      const userStateFile = payload.userStateFile || {
        file: "check-open-pr-updates.user-state.json",
        entry: null,
      };

      const diffMetadata = {
        ok: Boolean(diff.ok),
        file: diff.file || "data/pr-diffs/<repo>__pr-<number>.json",
        source: diff.source || "",
        stale: Boolean(diff.stale),
        warning: diff.warning || "",
        commitFingerprint: diff.commitFingerprint || "",
        fetchedAt: diff.fetchedAt || null,
        filePath: diff.filePath || "",
        error: diff.ok === false ? String(diff.error || "Unknown diff error") : "",
      };

      const diffBody = String(diff.diffText || "");

      return [
        "PR JSON Details for AI Review",
        `Repo: ${repo}`,
        `PR Number: ${prNumber}`,
        "",
        `Data File Entry (${String(dataFile.file || "check-open-pr-updates.data.json")})`,
        "```json",
        stringify(dataFile.entry),
        "```",
        "",
        `PR Detail File (${String(prDetailFile.file || "data/pr-details/<repo>__pr-<number>.json")})`,
        "```json",
        stringify(prDetailFile.entry),
        "```",
        "",
        `User State Entry (${String(userStateFile.file || "check-open-pr-updates.user-state.json")})`,
        "```json",
        stringify(userStateFile.entry),
        "```",
        "",
        `PR Diff Metadata (${String(diffMetadata.file || "data/pr-diffs/<repo>__pr-<number>.json")})`,
        "```json",
        stringify(diffMetadata),
        "```",
        "",
        "PR Diff Text",
        "```diff",
        diffBody,
        "```",
      ].join("\n");
    };

    return {
      formatDiffSummaryLine,
      buildPrJsonModalAiClipboardText,
    };
  };

  return {
    createPrJsonModalHelpers,
  };
});
