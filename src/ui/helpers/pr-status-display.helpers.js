(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrStatusDisplayHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrStatusDisplayHelpers = () => {
    const isChangedStatus = (status = "") =>
      String(status || "")
        .trim()
        .toUpperCase()
        .startsWith("CHANGED");

    const statusClass = (status = "") => {
      if (isChangedStatus(status)) return "status-changed";
      if (status === "NO_CHANGE") return "status-no-change";
      if (status === "NO_ACTIVITY") return "status-no-activity";
      return "";
    };

    const approvedClass = (approved = "") =>
      approved === "YES"
        ? "approved-yes"
        : approved === "NO"
          ? "approved-no"
          : "";

    const statusIcon = (group, stateRaw) => {
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

    const formatTitleWithIcons = (titleDisplay, fallbackTitle) => {
      const source = titleDisplay || fallbackTitle || "-";
      return source
        .replace(/\s*\[CHK:[^\]]+\]/g, "")
        .replace(/\s*\[MRG:[^\]]+\]/g, "");
    };

    const formatChkDisplay = (titleDisplay = "") => {
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

  return {
    createPrStatusDisplayHelpers,
  };
});
