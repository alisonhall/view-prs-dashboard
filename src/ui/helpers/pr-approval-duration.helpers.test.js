const {
  createPrApprovalDurationHelpers,
} = require("./pr-approval-duration.helpers.js");

describe("pr approval duration helpers", () => {
  test("given zero or negative minutes, when formatting, then 0m is returned", () => {
    const { formatDurationMinutes } = createPrApprovalDurationHelpers();

    expect(formatDurationMinutes(0)).toBe("0m");
    expect(formatDurationMinutes(-5)).toBe("0m");
  });

  test("given minutes under an hour, when formatting, then just minutes are shown", () => {
    const { formatDurationMinutes } = createPrApprovalDurationHelpers();

    expect(formatDurationMinutes(45)).toBe("45m");
  });

  test("given an exact number of hours, when formatting, then only hours are shown", () => {
    const { formatDurationMinutes } = createPrApprovalDurationHelpers();

    expect(formatDurationMinutes(120)).toBe("2h");
  });

  test("given hours and leftover minutes, when formatting, then both are shown", () => {
    const { formatDurationMinutes } = createPrApprovalDurationHelpers();

    expect(formatDurationMinutes(125)).toBe("2h 5m");
  });

  test("given a non-numeric value, when formatting, then it is treated as 0", () => {
    const { formatDurationMinutes } = createPrApprovalDurationHelpers();

    expect(formatDurationMinutes("not a number")).toBe("0m");
  });

  test("given an injected toCount, when formatting, then it is used instead of the default", () => {
    const toCount = jest.fn(() => 90);
    const { formatDurationMinutes } = createPrApprovalDurationHelpers({ toCount });

    expect(formatDurationMinutes("anything")).toBe("1h 30m");
    expect(toCount).toHaveBeenCalledWith("anything");
  });
});
