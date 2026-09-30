const { createPrNotesHelpers } = require("../helpers/pr-notes.helpers.js");

describe("pr notes helpers", () => {
  const { normalizeNotesListForUi } = createPrNotesHelpers();

  test("normalizeNotesListForUi returns non-empty arrays for all inputs", () => {
    expect(normalizeNotesListForUi(["one", "", 2])).toEqual(["one", "2"]);
    expect(normalizeNotesListForUi([])).toEqual([""]);
    expect(normalizeNotesListForUi("single")).toEqual(["single"]);
    expect(normalizeNotesListForUi(null)).toEqual([""]);
  });
});
