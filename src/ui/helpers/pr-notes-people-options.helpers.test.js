const {
  createPrNotesPeopleOptionsHelpers,
} = require("./pr-notes-people-options.helpers.js");

describe("pr notes people options helpers", () => {
  test("given a row with an author, commenters, reviewers, and approvers, when building options, then each unique person appears once", () => {
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers({
      resolveActorDisplayName: (login, _actorsMap, name) => name || login,
    });

    const row = {
      authorLogin: "alice",
      author: "Alice",
      metrics: {
        commentsByActor: [{ login: "bob", name: "Bob" }],
        reviewsByActor: [{ login: "alice", name: "Alice" }],
      },
      approvers: [{ login: "carol", name: "Carol" }],
    };

    expect(buildPrPeopleOptions(row, {})).toEqual([
      { login: "alice", name: "Alice" },
      { login: "bob", name: "Bob" },
      { login: "carol", name: "Carol" },
    ]);
  });

  test("given no row, when building options, then an empty array is returned", () => {
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers();

    expect(buildPrPeopleOptions()).toEqual([]);
  });

  test("given no injected resolveActorDisplayName, when building options, then the fallback name/login is used", () => {
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers();

    expect(buildPrPeopleOptions({ authorLogin: "alice", author: "Alice" })).toEqual([
      { login: "alice", name: "Alice" },
    ]);
  });

  test("given a person with no login, when building options, then that entry is skipped", () => {
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers();

    expect(
      buildPrPeopleOptions({
        metrics: { commentsByActor: [{ login: "", name: "No login" }] },
      }),
    ).toEqual([]);
  });

  test("given actorsMap, when building options, then it is passed through to resolveActorDisplayName", () => {
    const resolveActorDisplayName = jest.fn((login) => login);
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers({
      resolveActorDisplayName,
    });
    const actorsMap = { alice: "Alice Alison" };

    buildPrPeopleOptions({ authorLogin: "alice" }, actorsMap);

    expect(resolveActorDisplayName).toHaveBeenCalledWith("alice", actorsMap, undefined);
  });
});
