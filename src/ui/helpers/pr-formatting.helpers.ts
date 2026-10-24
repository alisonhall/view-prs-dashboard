// Small text formatters shared across the UI: HTML escaping, ANSI-escape
// stripping for script output, the "Jan 5, 2026 3:07 PM" date format, and
// lenient number parsing.
const createPrFormattingHelpers = () => {
  const escapeHtml = (str: unknown): string =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const stripAnsi = (text: unknown): string =>
    String(text || "")
      .replace(/\u001b\[[0-9;]*m/g, "") // eslint-disable-line no-control-regex
      .replace(/\u001b\]8;;.*?\u0007/g, "") // eslint-disable-line no-control-regex
      .replace(/\u001b\]8;;\u0007/g, ""); // eslint-disable-line no-control-regex

  const formatIsoDatetime = (isoValue: unknown): string => {
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

  const toCount = (value: unknown): number => {
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

export { createPrFormattingHelpers };
