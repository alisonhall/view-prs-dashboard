const { createPrApproversHelpers } = require("./pr-approvers.helpers.js");

describe("pr approvers helpers", () => {
  const createHelpers = () =>
    createPrApproversHelpers({
      asArray: (value) => (Array.isArray(value) ? value : []),
      getPreferredActorKey: (login, name) => String(login || name || "").trim(),
      resolveActorDisplayName: (login, actorsMap, fallbackName) =>
        String(actorsMap?.[login] || fallbackName || login || "").trim(),
      formatIsoDatetime: (value) => `formatted:${value}`,
    });

  test("given approval sources across metrics approvers and reviews, when collecting approvers, then deduped preferred keys are returned", () => {
    const helpers = createHelpers();

    const result = helpers.collectApproversFromRow({
      metrics: {
        approvals: [
          { login: "alice", name: "Alice" },
          { login: "alice", name: "Alice" },
        ],
      },
      approvers: [{ login: "bob", name: "Bob" }],
      reviews: [
        { state: "APPROVED", authorLogin: "carol", authorName: "Carol" },
        { state: "COMMENTED", authorLogin: "ignored", authorName: "Ignored" },
      ],
    });

    expect(result).toEqual([
      { login: "alice", name: "Alice" },
      { login: "bob", name: "Bob" },
      { login: "carol", name: "Carol" },
    ]);
  });

  test("given approver entries with actor names and timestamps, when formatting display, then names and approved-at text are rendered", () => {
    const helpers = createHelpers();

    const result = helpers.formatApproversDisplay(
      {
        approvers: [
          { login: "alice", name: "", approvedAt: "2026-07-22T10:00:00Z" },
          { login: "bob", name: "Bob", approvedAt: "2026-07-22T10:05:00Z" },
        ],
      },
      {
        alice: "Alice",
        bob: "Bob",
      },
    );

    expect(result).toBe(
      "Alice (alice) at formatted:2026-07-22T10:00:00Z; Bob (bob) at formatted:2026-07-22T10:05:00Z",
    );
  });

  test("given no approvers, when formatting display, then dash placeholder is returned", () => {
    const helpers = createHelpers();
    expect(helpers.formatApproversDisplay({}, {})).toBe("-");
  });
});
