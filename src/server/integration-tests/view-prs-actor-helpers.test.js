const { createViewPrsActorHelpers } = require("../helpers/view-prs-actor-helpers");

describe("view-prs actor helpers", () => {
  const helpers = createViewPrsActorHelpers({
    toTrimmedString: (value) => String(value ?? "").trim(),
  });

  test("given comma-separated display name, when normalizing, then first-last format is returned", () => {
    expect(helpers.normalizeDisplayName("Hall, Alison")).toBe("Alison Hall");
  });

  test("given alias mapping with invalid rows, when normalizing aliases, then only valid aliases remain", () => {
    expect(
      helpers.normalizeActorLoginAliases({
        " alias ": " canonical ",
        same: "same",
        blank: "",
      }),
    ).toEqual({ alias: "canonical" });
  });

  test("given cyclic alias mapping, when resolving canonical login, then the last non-repeated value is returned", () => {
    const aliases = {
      a: "b",
      b: "c",
      c: "a",
    };

    expect(helpers.resolveCanonicalActorLogin("a", aliases)).toBe("c");
  });

  test("given actor cache entries, when normalizing cache, then empty keys and names are removed", () => {
    expect(
      helpers.normalizeActorNameCacheEntries({
        user1: " Jane Doe ",
        "": "nobody",
        user2: "",
      }),
    ).toEqual({ user1: "Jane Doe" });
  });

  test("given login-only display name, when adding actor name, then map is not updated", () => {
    const actorsMap = {};
    helpers.addActorName(actorsMap, "user_login", "user_login");
    expect(actorsMap).toEqual({});
  });
});
