const { createViewPrsActorHelpers } = require("../helpers/view-prs-actor-helpers");

describe("view-prs actor helpers", () => {
  const helpers = createViewPrsActorHelpers({
    toTrimmedString: (value) => String(value ?? "").trim(),
  });

  test("given comma-separated display name, when normalizing, then first-last format is returned", () => {
    expect(helpers.normalizeDisplayName("Hall, Alison")).toBe("Alison Hall");
  });

  test("given extra spaces, when normalizing, then they're collapsed", () => {
    expect(helpers.normalizeDisplayName("  Alison   Hall ")).toBe("Alison Hall");
  });
});
