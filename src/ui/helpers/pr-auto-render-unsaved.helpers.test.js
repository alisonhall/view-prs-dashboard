/** @jest-environment jsdom */

const {
  createPrAutoRenderUnsavedHelpers,
} = require("./pr-auto-render-unsaved.helpers.ts");

describe("auto render unsaved helpers", () => {
  const createHelpers = ({ getDirtyNotesPrKeys } = {}) =>
    createPrAutoRenderUnsavedHelpers({
      getDirtyNotesPrKeys,
    });

  test("given dirty notes PR keys with a duplicate, when collecting blocking PR keys, then unique keys sorted by repo then number are returned", () => {
    const { getUnsavedNotesPrKeys, getBlockingPrKeys } = createHelpers({
      getDirtyNotesPrKeys: () => ["acme/web#12", "acme/web#7", "acme/api#30", "acme/web#12"],
    });

    expect(getUnsavedNotesPrKeys()).toEqual(["acme/web#12", "acme/web#7", "acme/api#30", "acme/web#12"]);
    expect(getBlockingPrKeys()).toEqual(["acme/api#30", "acme/web#7", "acme/web#12"]);
  });

  test("given no getDirtyNotesPrKeys hook, when reading unsaved notes PR keys, then it is a safe empty default", () => {
    const { getUnsavedNotesPrKeys } = createHelpers();

    expect(getUnsavedNotesPrKeys()).toEqual([]);
  });

  test("given malformed values from getDirtyNotesPrKeys, when reading unsaved notes PR keys, then only PR keys are kept", () => {
    const { getUnsavedNotesPrKeys } = createHelpers({
      getDirtyNotesPrKeys: () => ["acme/api#12", "abc", " acme/api#7 ", "", "12", "acme/api#x"],
    });

    expect(getUnsavedNotesPrKeys()).toEqual(["acme/api#12", "acme/api#7"]);
  });

  test("given malformed PR values, when normalizing PR keys, then only repo-and-number keys are accepted", () => {
    const { normalizePrKey } = createHelpers();

    expect(normalizePrKey("acme/api#42")).toBe("acme/api#42");
    expect(normalizePrKey(" #7 ")).toBe("#7");
    expect(normalizePrKey("42")).toBe("");
    expect(normalizePrKey("abc")).toBe("");
  });
});
