/** @jest-environment jsdom */

const {
  createPrAuthorInsightsIdentityHelpers,
} = require("./pr-author-insights-identity.helpers.ts");

describe("author insights identity helpers", () => {
  const createHelpers = () =>
    createPrAuthorInsightsIdentityHelpers({
      normalizeActorLogin: (value) => String(value || "").trim().toLowerCase(),
      resolveActorDisplayName: (login, actorsMap, fallback) =>
        String((actorsMap && actorsMap[login]) || fallback || login || "").trim(),
      getLatestActorsMap: () => ({ alice: "Alice A", bob: "Bob B" }),
    });

  test("given author login, when resolving author insights display name, then normalized actor display name is returned", () => {
    const { getAuthorInsightsDisplayName } = createHelpers();

    expect(getAuthorInsightsDisplayName("Alice")).toBe("Alice A");
    expect(getAuthorInsightsDisplayName("bob")).toBe("Bob B");
    expect(getAuthorInsightsDisplayName("")).toBe("");
  });

  test("given note author and selected author, when matching author selection, then login and display-name matches are supported", () => {
    const { noteAuthorMatchesSelection } = createHelpers();
    const selectedAuthor = { login: "alice", name: "Alice A" };

    expect(
      noteAuthorMatchesSelection("alice", selectedAuthor, { alice: "Alice A" }),
    ).toBe(true);
    expect(
      noteAuthorMatchesSelection("Alice", selectedAuthor, { alice: "Alice A" }),
    ).toBe(true);
    expect(
      noteAuthorMatchesSelection("someone-else", selectedAuthor, {
        "someone-else": "Someone Else",
      }),
    ).toBe(false);
  });

  test("given a note author written as a name, when matching author selection, then the plain name and a login resolving to the name both match", () => {
    const { noteAuthorMatchesSelection } = createHelpers();
    const selectedAuthor = { login: "alice", name: "Alice A" };

    // The note's author field holds the person's name itself.
    expect(noteAuthorMatchesSelection("Alice A", selectedAuthor, {})).toBe(true);
    // An alternate login whose display name is the selected author's name.
    expect(noteAuthorMatchesSelection("alice-work", selectedAuthor, { "alice-work": "Alice A" })).toBe(true);
  });

  test("given no note author or no selected author, when matching author selection, then it doesn't match", () => {
    const { noteAuthorMatchesSelection } = createHelpers();

    expect(noteAuthorMatchesSelection("", { login: "alice", name: "Alice A" }, {})).toBe(false);
    expect(noteAuthorMatchesSelection("alice", null, {})).toBe(false);
  });
});
