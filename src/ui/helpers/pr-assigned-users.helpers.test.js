const {
  createPrAssignedUsersHelpers,
} = require("./pr-assigned-users.helpers.js");

describe("pr assigned users helpers", () => {
  const createHelpers = () =>
    createPrAssignedUsersHelpers({
      asArray: (value) => (Array.isArray(value) ? value : []),
      normalizeActorLogin: (value) => String(value || "").trim(),
      resolveActorDisplayName: (login, actorsMap, fallbackName) =>
        String(actorsMap?.[login] || fallbackName || login || "").trim(),
    });

  test("given assignee sources with duplicates, when collecting assigned users, then normalized unique assignees are returned", () => {
    const helpers = createHelpers();

    const result = helpers.collectAssignedUsers({
      assignees: ["alice", { login: "bob", name: "Bob" }, "alice"],
      assignedUsers: [{ assigneeLogin: "carol", assigneeName: "Carol" }],
      assignedTo: [{ user: { login: "bob", name: "Bob" } }],
    });

    expect(result).toEqual([
      { login: "alice", name: "" },
      { login: "bob", name: "Bob" },
      { login: "carol", name: "Carol" },
    ]);
  });

  test("given assignment events without explicit assignee fields, when collecting assigned users, then actor fallback is used", () => {
    const helpers = createHelpers();

    const result = helpers.collectAssignedUsers({
      activityEvents: [
        {
          type: "assigned",
          actor: "reviewer1",
          actorName: "Reviewer One",
        },
      ],
    });

    expect(result).toEqual([
      { login: "reviewer1", name: "Reviewer One" },
    ]);
  });

  test("given resolved actor names, when formatting assigned users, then display contains names and login disambiguation", () => {
    const helpers = createHelpers();

    const result = helpers.formatAssignedUsersDisplay(
      {
        assignees: [
          { login: "reviewer1", name: "" },
          { login: "reviewer2", name: "Reviewer Two" },
        ],
      },
      {
        reviewer1: "Reviewer One",
        reviewer2: "Reviewer Two",
      },
    );

    expect(result).toBe("Reviewer One (reviewer1); Reviewer Two (reviewer2)");
  });

  test("given no assignees available, when formatting assigned users, then dash placeholder is returned", () => {
    const helpers = createHelpers();
    expect(helpers.formatAssignedUsersDisplay({}, {})).toBe("-");
  });
});
