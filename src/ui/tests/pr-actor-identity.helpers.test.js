const {
  createPrActorIdentityHelpers,
} = require("../helpers/pr-actor-identity.helpers.js");

describe("pr actor identity helpers", () => {
  test("given login alias chain, when normalizeActorLogin is called, then it resolves to canonical login", () => {
    const helpers = createPrActorIdentityHelpers({
      getActorLoginAliases: () => ({
        aliasA: "aliasB",
        aliasB: "canonical",
      }),
    });

    expect(helpers.normalizeActorLogin("aliasA")).toBe("canonical");
    expect(helpers.normalizeActorLogin("canonical")).toBe("canonical");
  });

  test("given mapped display names, when resolveActorDisplayName is called, then it prefers mapped names and handles Copilot fallback", () => {
    const helpers = createPrActorIdentityHelpers();

    expect(
      helpers.resolveActorDisplayName("person-login", {
        "person-login": "Person Name",
      }),
    ).toBe("Person Name");

    expect(
      helpers.resolveActorDisplayName("copilot-pull-request-reviewer", {}),
    ).toBe("Copilot");
  });

  test("given row actor sources, when buildRowActorsMap is called, then it merges actor names across row fields", () => {
    const helpers = createPrActorIdentityHelpers();
    const row = {
      authorLogin: "author-login",
      author: "Author Name",
      reviews: [
        {
          authorLogin: "reviewer-login",
          authorName: "Reviewer Name",
        },
      ],
      commentEvents: [
        {
          actor: "commenter-login",
          actorName: "Commenter Name",
        },
      ],
    };

    const actorsMap = helpers.buildRowActorsMap(row, {
      existing: "Existing Name",
    });

    expect(actorsMap.existing).toBe("Existing Name");
    expect(actorsMap["author-login"]).toBe("Author Name");
    expect(actorsMap["reviewer-login"]).toBe("Reviewer Name");
    expect(actorsMap["commenter-login"]).toBe("Commenter Name");
    expect(actorsMap["copilot-pull-request-reviewer"]).toBe("Copilot");
  });
});
