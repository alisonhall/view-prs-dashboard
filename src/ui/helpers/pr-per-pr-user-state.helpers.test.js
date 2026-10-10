const { getPerPrUserStateFromPayload } = require("./pr-per-pr-user-state.helpers.js");

describe("pr per-PR user state helper", () => {
  test("given a payload with matching notes/ack/reverify/inReview data, when resolving, then it returns all 4", () => {
    const payload = {
      byPrNumber: { "101": { notes: { otherNotes: "hi" } } },
      ackByRepo: { "owner/repo": { "101": true } },
      reverifyByRepo: { "owner/repo": { "101": false } },
      inReviewByRepo: { "owner/repo": { "101": true } },
    };

    const result = getPerPrUserStateFromPayload(payload, null, "101", "owner/repo");

    expect(result).toEqual({
      notesByPrNumber: { otherNotes: "hi" },
      ackByRepo: true,
      reverifyByRepo: false,
      inReviewByRepo: true,
    });
  });

  test("given no repo, when resolving, then all per-repo values are null (notes still fall back to the entry)", () => {
    const result = getPerPrUserStateFromPayload({}, { notes: { otherNotes: "fallback" } }, "101", "");

    expect(result).toEqual({
      notesByPrNumber: { otherNotes: "fallback" },
      ackByRepo: null,
      reverifyByRepo: null,
      inReviewByRepo: null,
    });
  });

  test("given an empty/undefined payload, when resolving, then it returns all nulls rather than throwing", () => {
    expect(getPerPrUserStateFromPayload(undefined, undefined, "101", "owner/repo")).toEqual({
      notesByPrNumber: null,
      ackByRepo: null,
      reverifyByRepo: null,
      inReviewByRepo: null,
    });
  });

  test("given a PR number with no entry in a repo map, when resolving, then that field is null, not undefined", () => {
    const payload = { ackByRepo: { "owner/repo": {} } };
    const result = getPerPrUserStateFromPayload(payload, null, "999", "owner/repo");
    expect(result.ackByRepo).toBeNull();
  });
});
