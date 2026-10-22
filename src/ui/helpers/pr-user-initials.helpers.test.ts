const {
  createPrUserInitialsHelpers,
} = require("./pr-user-initials.helpers.js");

describe("pr user initials helpers", () => {
  test("given a two-word name, when computing initials, then the first letter of each word is used", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("The Octocat")).toBe("TO");
  });

  test("given a single long word, when computing initials, then the first two letters are used", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("Octocat")).toBe("OC");
  });

  test("given a 'Last, First' formatted name, when computing initials, then it's reordered to 'First Last' first", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("Hall, Alison")).toBe("AH");
  });

  test("given an empty/too-short name, when computing initials, then it falls back to the login", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("", "octocat")).toBe("OC");
    expect(getUserInitials("a", "octocat")).toBe("OC");
  });

  test("given a multi-word login fallback, when computing initials, then the first letter of each login word is used", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("", "jane-doe")).toBe("JD");
  });

  test("given no name and no login, when computing initials, then it falls back to '--'", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("", "")).toBe("--");
  });

  test("given a single-letter login fallback, when computing initials, then that single letter is used", () => {
    const { getUserInitials } = createPrUserInitialsHelpers();

    expect(getUserInitials("", "x")).toBe("X");
  });
});
