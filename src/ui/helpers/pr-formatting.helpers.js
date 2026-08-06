(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFormattingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFormattingHelpers = () => {
    const escapeHtml = (str) =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const stripAnsi = (text) =>
      String(text || "")
        .replace(/\u001b\[[0-9;]*m/g, "") // eslint-disable-line no-control-regex
        .replace(/\u001b\]8;;.*?\u0007/g, "") // eslint-disable-line no-control-regex
        .replace(/\u001b\]8;;\u0007/g, ""); // eslint-disable-line no-control-regex

    const formatIsoDatetime = (isoValue) => {
      const raw = String(isoValue ?? "").trim();
      if (!raw || raw === "-") return "-";

      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;

      const month = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ][date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      const minute = String(date.getMinutes()).padStart(2, "0");

      const hour24 = date.getHours();
      const meridiem = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      return `${month} ${day}, ${year} ${hour12}:${minute} ${meridiem}`;
    };

    const toCount = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return {
      escapeHtml,
      stripAnsi,
      formatIsoDatetime,
      toCount,
    };
  };

  return {
    createPrFormattingHelpers,
  };
});
