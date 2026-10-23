// Status/approval CSS classes, CHK icons, and the title text with its
// "[CHK:...]"/"[MRG:...]" markers removed, for the PR table cells.
const createPrStatusDisplayHelpers = () => {
  const isChangedStatus = (status: unknown = ""): boolean =>
    String(status || "")
      .trim()
      .toUpperCase()
      .startsWith("CHANGED");

  const statusClass = (status: unknown = ""): string => {
    if (isChangedStatus(status)) return "status-changed";
    if (status === "NO_CHANGE") return "status-no-change";
    if (status === "NO_ACTIVITY") return "status-no-activity";
    return "";
  };

  const approvedClass = (approved: unknown = ""): string =>
    approved === "YES"
      ? "approved-yes"
      : approved === "NO"
        ? "approved-no"
        : "";

  const statusIcon = (group: string, stateRaw: unknown): string => {
    const state = String(stateRaw || "").toUpperCase();

    if (group === "CHK") {
      if (state === "PASS") return "✅";
      if (state === "FAIL") return "❌";
      if (state === "RUN") return "⏳";
      if (state === "SKIP") return "⏭️";
      if (state === "NA") return "⚪";
      return "❔";
    }

    return "❔";
  };

  const formatTitleWithIcons = (titleDisplay?: string | null, fallbackTitle?: string | null): string => {
    const source = titleDisplay || fallbackTitle || "-";
    return source
      .replace(/\s*\[CHK:[^\]]+\]/g, "")
      .replace(/\s*\[MRG:[^\]]+\]/g, "");
  };

  const formatChkDisplay = (titleDisplay: unknown = ""): string => {
    const match = String(titleDisplay || "").match(/\[CHK:([^\]]+)\]/);
    if (!match || !match[1]) return "-";
    const state = String(match[1]).trim().toUpperCase();
    return `${statusIcon("CHK", state)} ${state}`;
  };

  return {
    isChangedStatus,
    statusClass,
    approvedClass,
    statusIcon,
    formatTitleWithIcons,
    formatChkDisplay,
  };
};

export { createPrStatusDisplayHelpers };
