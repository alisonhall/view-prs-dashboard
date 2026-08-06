const { createPrFormattingHelpers } = require("./pr-formatting.helpers.js");

describe("pr formatting helpers", () => {
  const { escapeHtml, stripAnsi, formatIsoDatetime, toCount } =
    createPrFormattingHelpers();

  test("given html text, when escaping html, then special characters are encoded", () => {
    expect(escapeHtml('<div class="x">&</div>')).toBe(
      "&lt;div class=&quot;x&quot;&gt;&amp;&lt;/div&gt;",
    );
  });

  test("given ansi styled text, when stripping ansi, then escape sequences are removed", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m text")).toBe("red text");
  });

  test("given iso timestamp and invalid values, when formatting datetime, then readable and fallback values are returned", () => {
    const date = new Date("2026-07-15T14:30:00Z");
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

    expect(formatIsoDatetime("2026-07-15T14:30:00Z")).toBe(
      `${month} ${day}, ${year} ${hour12}:${minute} ${meridiem}`,
    );
    expect(formatIsoDatetime("-")).toBe("-");
    expect(formatIsoDatetime("not-a-date")).toBe("not-a-date");
  });

  test("given numeric and nonnumeric values, when converting to count, then numeric values pass through and invalid values become zero", () => {
    expect(toCount("42")).toBe(42);
    expect(toCount("abc")).toBe(0);
  });
});
