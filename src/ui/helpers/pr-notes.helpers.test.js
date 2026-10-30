const { createPrNotesHelpers } = require("../helpers/pr-notes.helpers.ts");

describe("pr notes helpers", () => {
  const { normalizeStoriesForUi } = createPrNotesHelpers();

  test("normalizeStoriesForUi keeps rows with a name or URL, as strings", () => {
    expect(
      normalizeStoriesForUi([
        { name: "US1", url: "https://x/US1" },
        { name: "", url: "" },
        { url: "https://x/US2" },
        null,
      ]),
    ).toEqual([
      { name: "US1", url: "https://x/US1" },
      { name: "", url: "https://x/US2" },
    ]);
  });

  test("normalizeStoriesForUi returns one empty row when there are no stories", () => {
    expect(normalizeStoriesForUi([])).toEqual([{ name: "", url: "" }]);
    expect(normalizeStoriesForUi(undefined)).toEqual([{ name: "", url: "" }]);
  });
});
