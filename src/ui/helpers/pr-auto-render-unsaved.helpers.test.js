/** @jest-environment jsdom */

const {
  createPrAutoRenderUnsavedHelpers,
} = require("./pr-auto-render-unsaved.helpers.ts");

describe("auto render unsaved helpers", () => {
  const createHelpers = ({ getDirtyNotesPrNumbers } = {}) =>
    createPrAutoRenderUnsavedHelpers({
      getDirtyNotesPrNumbers,
    });

  test("given dirty notes PR numbers with a duplicate, when collecting blocking PR numbers, then unique sorted PR numbers are returned", () => {
    const { getUnsavedNotesPrNumbers, getBlockingPrNumbers } = createHelpers({
      getDirtyNotesPrNumbers: () => ["12", "7", "12"],
    });

    expect(getUnsavedNotesPrNumbers()).toEqual(["12", "7", "12"]);
    expect(getBlockingPrNumbers()).toEqual(["7", "12"]);
  });

  test("given no getDirtyNotesPrNumbers hook, when reading unsaved notes PR numbers, then it is a safe empty default", () => {
    const { getUnsavedNotesPrNumbers } = createHelpers();

    expect(getUnsavedNotesPrNumbers()).toEqual([]);
  });

  test("given malformed values from getDirtyNotesPrNumbers, when reading unsaved notes PR numbers, then only digit-only values are kept", () => {
    const { getUnsavedNotesPrNumbers } = createHelpers({
      getDirtyNotesPrNumbers: () => ["12", "abc", " 7 ", ""],
    });

    expect(getUnsavedNotesPrNumbers()).toEqual(["12", "7"]);
  });

  test("given malformed PR values, when normalizing PR numbers, then only digits are accepted", () => {
    const { normalizePrNumber } = createHelpers();

    expect(normalizePrNumber("42")).toBe("42");
    expect(normalizePrNumber(" 007 ")).toBe("007");
    expect(normalizePrNumber("abc")).toBe("");
  });
});
