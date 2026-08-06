const {
  createPrRowEntry,
  validatePrRowEntryShape,
} = require("./pr-row.fixtures.js");

describe("pr row fixtures", () => {
  test("given default fixture output, when shape is validated, then the fixture is valid", () => {
    const fixture = createPrRowEntry();
    const result = validatePrRowEntryShape(fixture);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test("given invalid fixture override, when shape is validated, then required field issues are reported", () => {
    const fixture = createPrRowEntry({
      repo: "",
      data: {
        number: "",
        status: "",
        labels: "not-an-array",
      },
    });

    const result = validatePrRowEntryShape(fixture);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "repo is required",
        "data.number is required",
        "data.status is required",
        "data.labels must be an array",
      ]),
    );
  });
});
