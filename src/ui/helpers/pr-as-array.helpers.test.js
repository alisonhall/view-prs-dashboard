const { asArray } = require("./pr-as-array.helpers.js");

describe("pr as array helper", () => {
  test("given an array, when normalizing, then it's returned unchanged", () => {
    const value = [1, 2, 3];
    expect(asArray(value)).toBe(value);
  });

  test("given a non-array value, when normalizing, then it returns an empty array", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray("not an array")).toEqual([]);
    expect(asArray({})).toEqual([]);
  });
});
