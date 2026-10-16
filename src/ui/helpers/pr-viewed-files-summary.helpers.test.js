const {
  createPrViewedFilesSummaryHelpers,
} = require("./pr-viewed-files-summary.helpers.js");

describe("pr viewed files summary helpers", () => {
  test("given an explicit viewedFilesSummary, when summarizing, then it is used directly", () => {
    const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers();

    expect(getViewedFilesSummary({ viewedFilesSummary: "custom" })).toBe("custom");
  });

  test("given no explicit summary, when summarizing, then it is built from the viewed/changed counts", () => {
    const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers();

    expect(getViewedFilesSummary({ viewedFilesCount: 3, changedFilesCount: 5 })).toBe("3/5 viewed");
  });

  test("given no row, when summarizing, then counts default to 0", () => {
    const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers();

    expect(getViewedFilesSummary()).toBe("0/0 viewed");
  });

  test("given an injected toCount, when summarizing, then it is used instead of the default", () => {
    const toCount = jest.fn(() => 9);
    const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers({ toCount });

    expect(getViewedFilesSummary({ viewedFilesCount: 1, changedFilesCount: 2 })).toBe("9/9 viewed");
    expect(toCount).toHaveBeenCalledWith(1);
    expect(toCount).toHaveBeenCalledWith(2);
  });
});
