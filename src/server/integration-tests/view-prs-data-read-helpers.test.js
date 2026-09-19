const {
  createViewPrsDataReadHelpers,
} = require("../helpers/view-prs-data-read-helpers");

describe("view-prs data read helpers", () => {
  test("given a data snapshot, when reading with diff refresh enqueued, then the same data is returned and enqueue is called with that snapshot", () => {
    const data = {
      byPrNumber: { "101": { number: "101" } },
      lastRun: "2026-07-22T12:00:00.000Z",
    };
    const readViewPrsData = jest.fn(() => data);
    const enqueuePrDiffRefreshForData = jest.fn();

    const helpers = createViewPrsDataReadHelpers({
      readViewPrsData,
      enqueuePrDiffRefreshForData,
    });

    const result = helpers.readDataWithDiffRefreshEnqueued();

    expect(result).toBe(data);
    expect(readViewPrsData).toHaveBeenCalledTimes(1);
    expect(enqueuePrDiffRefreshForData).toHaveBeenCalledTimes(1);
    expect(enqueuePrDiffRefreshForData).toHaveBeenCalledWith(data);
  });
});