/** @jest-environment jsdom */

const {
  createPrAuthorInsightsIdentityHelpers,
} = require("./pr-author-insights-identity.helpers.js");

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
});
