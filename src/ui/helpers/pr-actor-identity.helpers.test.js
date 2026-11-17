const {
  buildActorIndex,
  createPrActorIdentityHelpers,
  isActorId,
} = require("../helpers/pr-actor-identity.helpers.ts");

describe("pr actor identity helpers", () => {
  const PEOPLE = [
    { id: "actor:ann", name: "Ann Lee", logins: ["Ann", "ann-work"] },
    { id: "actor:bob", name: "", logins: ["bob"] },
  ];
  const withPeople = () => createPrActorIdentityHelpers({ getActorIndex: () => buildActorIndex(PEOPLE) });

  test("a person's key is their id, from any of their logins in any case, or an id itself; a login no one has is its own", () => {
    const helpers = withPeople();
    expect(helpers.normalizeActorLogin("ann")).toBe("actor:ann");
    expect(helpers.normalizeActorLogin("ANN-WORK")).toBe("actor:ann");
    expect(helpers.normalizeActorLogin("actor:ann")).toBe("actor:ann");
    expect(helpers.normalizeActorLogin("stranger")).toBe("stranger");
    expect(helpers.getPreferredActorKey("", "Fallback Name")).toBe("Fallback Name");
  });

  test("a key's logins and main login: every login of the person, the first their main one; a login no one has is its own", () => {
    const helpers = withPeople();
    expect(helpers.loginsOfActorKey("actor:ann")).toEqual(["Ann", "ann-work"]);
    expect(helpers.loginsOfActorKey("ann-work")).toEqual(["Ann", "ann-work"]);
    expect(helpers.loginOfActorKey("actor:ann")).toBe("Ann");
    expect(helpers.loginOfActorKey("stranger")).toBe("stranger");
    // An id whose person is gone: no logins, shown as the id.
    expect(helpers.loginsOfActorKey("actor:gone")).toEqual([]);
    expect(helpers.loginOfActorKey("actor:gone")).toBe("actor:gone");
  });

  test("a name: the server's (by key), else the data's, else the main login - never the id", () => {
    const helpers = withPeople();
    const actorsMap = { "actor:ann": "Ann Lee", "actor:bob": "actor:bob" };
    expect(helpers.resolveActorDisplayName("ann-work", actorsMap)).toBe("Ann Lee");
    // No name: the id in the map isn't one.
    expect(helpers.resolveActorDisplayName("bob", actorsMap, "Bob From Data")).toBe("Bob From Data");
    expect(helpers.resolveActorDisplayName("bob", actorsMap)).toBe("bob");
    expect(helpers.resolveActorDisplayName("actor:bob", actorsMap, "bob")).toBe("bob");
    // A name that's a login of theirs exactly isn't one; in another case it is.
    expect(helpers.resolveActorDisplayName("ann", {}, "ann-work")).toBe("Ann");
    expect(helpers.resolveActorDisplayName("bob", {}, "Bob")).toBe("Bob");
  });

  test("a row's names fill in for a person with no name, not over one", () => {
    const helpers = withPeople();
    const map = helpers.buildRowActorsMap(
      { authorLogin: "bob", author: "Bob From Data", approvers: [{ login: "ann", name: "Other Name" }] },
      { "actor:ann": "Ann Lee", "actor:bob": "actor:bob" },
    );
    expect(map["actor:bob"]).toBe("Bob From Data");
    expect(map["actor:ann"]).toBe("Ann Lee");
  });

  test("a person merged into another (actorIdMoves): their old id is the other's key, logins and name", () => {
    const helpers = createPrActorIdentityHelpers({
      getActorIndex: () => buildActorIndex(PEOPLE, { "actor:ann-old": "actor:ann", "actor:older": "actor:ann-old" }),
    });
    expect(helpers.normalizeActorLogin("actor:ann-old")).toBe("actor:ann");
    expect(helpers.normalizeActorLogin("actor:older")).toBe("actor:ann");
    expect(helpers.loginsOfActorKey("actor:older")).toEqual(["Ann", "ann-work"]);
    expect(helpers.resolveActorDisplayName("actor:ann-old", { "actor:ann": "Ann Lee" })).toBe("Ann Lee");
  });

  test("ids are never logins", () => {
    expect(isActorId("actor:ann")).toBe(true);
    expect(isActorId("ann")).toBe(false);
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
