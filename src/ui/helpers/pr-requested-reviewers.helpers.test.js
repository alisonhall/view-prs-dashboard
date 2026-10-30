const {
  createPrRequestedReviewersHelpers,
} = require("./pr-requested-reviewers.helpers.ts");

describe("pr requested reviewers helpers", () => {
  const createHelpers = () =>
    createPrRequestedReviewersHelpers({
      asArray: (value) => (Array.isArray(value) ? value : []),
      resolveActorDisplayName: (login, actorsMap, fallbackName) =>
        String(actorsMap?.[login] || fallbackName || login || "").trim(),
    });

  test("given direct requested reviewers and review requests, when collecting requested reviewers, then normalized unique reviewer logins are returned", () => {
    const helpers = createHelpers();

    const result = helpers.collectRequestedReviewers({
      requestedReviewers: ["alice", "bob", "alice"],
      reviewRequests: [{ reviewerLogin: "carol", reviewerName: "Carol" }],
      reviewers: [{ login: "bob", name: "Bob" }],
    });

    expect(result).toEqual([
      { login: "alice", name: "" },
      { login: "bob", name: "" },
      { login: "carol", name: "Carol" },
    ]);
  });

  test("given no requested reviewer arrays, when collecting requested reviewers, then review actor fallbacks are used", () => {
    const helpers = createHelpers();

    const result = helpers.collectRequestedReviewers({
      reviews: [
        { authorLogin: "reviewer1", authorName: "Reviewer One" },
        { authorLogin: "reviewer1", authorName: "Reviewer One" },
      ],
      metrics: {
        reviewsByActor: [{ login: "reviewer2", name: "Reviewer Two" }],
      },
    });

    expect(result).toEqual([
      { login: "reviewer1", name: "Reviewer One" },
      { login: "reviewer2", name: "Reviewer Two" },
    ]);
  });

  test("given only reviews, when collecting pending review requests, then nobody is listed (no fallback)", () => {
    const helpers = createHelpers();
    const row = {
      requestedReviewers: [],
      reviews: [{ authorLogin: "reviewer1", authorName: "Reviewer One" }],
      metrics: { reviewsByActor: [{ login: "reviewer2", name: "Reviewer Two" }] },
    };

    expect(helpers.collectPendingReviewRequests(row)).toEqual([]);
    expect(helpers.collectRequestedReviewers(row)).toHaveLength(2);
  });

  test("given outstanding requests, when collecting pending review requests, then they're listed", () => {
    const helpers = createHelpers();

    expect(
      helpers.collectPendingReviewRequests({
        requestedReviewers: [{ login: "carol", name: "Carol" }],
        reviews: [{ authorLogin: "reviewer1" }],
      }),
    ).toEqual([{ login: "carol", name: "Carol" }]);
  });

  test("given resolved actor names, when formatting requested reviewers, then display contains names and login disambiguation", () => {
    const helpers = createHelpers();

    const result = helpers.formatRequestedReviewersDisplay(
      {
        requestedReviewers: [{ login: "reviewer1", name: "" }, { login: "reviewer2", name: "Reviewer Two" }],
      },
      {
        reviewer1: "Reviewer One",
        reviewer2: "Reviewer Two",
      },
    );

    expect(result).toBe("Reviewer One (reviewer1); Reviewer Two (reviewer2)");
  });

  test("given no reviewers available, when formatting requested reviewers, then dash placeholder is returned", () => {
    const helpers = createHelpers();
    expect(helpers.formatRequestedReviewersDisplay({}, {})).toBe("-");
  });
});
