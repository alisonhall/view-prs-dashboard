const {
  createViewPrsDataDeltaHelpers,
} = require("../helpers/view-prs-data-delta-helpers");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

describe("view-prs data-delta helpers", () => {
  test("given a non-object body, when parsing requested PR numbers, then null is returned", () => {
    const helpers = createViewPrsDataDeltaHelpers({ isObject });

    expect(helpers.parseRequestedPrNumbers(null)).toBeNull();
    expect(helpers.parseRequestedPrNumbers([])).toBeNull();
    expect(helpers.parseRequestedPrNumbers({})).toBeNull();
  });

  test("given mixed prNumbers values, when parsing requested PR numbers, then numeric IDs are normalized and deduplicated", () => {
    const helpers = createViewPrsDataDeltaHelpers({ isObject });

    const result = helpers.parseRequestedPrNumbers({
      prNumbers: [" 123 ", 123, "abc", "", "456", "0456", null],
    });

    expect(result).toEqual(["123", "456", "0456"]);
  });

  test("given requested numbers and data rows, when building a delta payload, then only existing rows are returned with missing numbers listed", () => {
    const helpers = createViewPrsDataDeltaHelpers({ isObject });

    const payload = helpers.buildDataDeltaPayload({
      data: {
        byPrNumber: {
          "101": { number: "101" },
          "303": { number: "303" },
        },
      },
      requestedPrNumbers: ["101", "202", "303"],
    });

    expect(payload).toEqual({
      byPrNumber: {
        "101": { number: "101" },
        "303": { number: "303" },
      },
      missingPrNumbers: ["202"],
      requestedCount: 3,
    });
  });

  test("given data without a byPrNumber object, when building a delta payload, then all requested numbers are marked missing", () => {
    const helpers = createViewPrsDataDeltaHelpers({ isObject });

    const payload = helpers.buildDataDeltaPayload({
      data: { byPrNumber: null },
      requestedPrNumbers: ["10", "20"],
    });

    expect(payload).toEqual({
      byPrNumber: {},
      missingPrNumbers: ["10", "20"],
      requestedCount: 2,
    });
  });
});