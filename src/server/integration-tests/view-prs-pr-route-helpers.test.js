const {
  createViewPrsPrRouteHelpers,
} = require("../helpers/view-prs-pr-route-helpers");

describe("view-prs pr route helpers", () => {
  const createHelpers = () =>
    createViewPrsPrRouteHelpers({
      isRepoSlug: (value) => /^[^/\s]+\/[^/\s]+$/.test(String(value || "").trim()),
    });

  test("given notes request fields, when parsing notes request, then normalized pr number and raw comments list are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseNotesRequest({
        prNumber: " 42 ",
        comments: [{ id: "a" }],
      }),
    ).toEqual({
      prNumber: "42",
      rawComments: [{ id: "a" }],
    });
  });

  test("given non-array comments in notes request, when parsing notes request, then comments default to empty array", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseNotesRequest({
        prNumber: "42",
        comments: "bad-shape",
      }),
    ).toEqual({
      prNumber: "42",
      rawComments: [],
    });
  });

  test("given pr number text, when validating note pr number, then only positive integer values are accepted", () => {
    const helpers = createHelpers();

    expect(helpers.isValidPrNumber("42")).toBe(true);
    expect(helpers.isValidPrNumber("0")).toBe(false);
    expect(helpers.isValidPrNumber("abc")).toBe(false);
    expect(helpers.isValidPrNumber("")).toBe(false);
  });

  test("given diff query params, when parsing diff request, then normalized repo and pr number values are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseDiffRequest({
        repo: " owner/repo ",
        prNumber: " 99 ",
      }),
    ).toEqual({
      repo: "owner/repo",
      prNumber: "99",
    });
  });

  test("given diff request values, when validating diff request, then repo slug and numeric pr number are both required", () => {
    const helpers = createHelpers();

    expect(helpers.isValidDiffRequest({ repo: "owner/repo", prNumber: "12" })).toBe(
      true,
    );
    expect(helpers.isValidDiffRequest({ repo: "bad-repo", prNumber: "12" })).toBe(
      false,
    );
    expect(helpers.isValidDiffRequest({ repo: "owner/repo", prNumber: "abc" })).toBe(
      false,
    );
  });

  test("given stored PR rows, when finding diff entry by repo and pr number, then the matching row is returned across prNumber and data.number shapes", () => {
    const helpers = createHelpers();

    expect(
      helpers.findDiffEntry({
        repo: "owner/repo",
        prNumber: "42",
        byPrNumber: {
          "41": { repo: "owner/repo", prNumber: "41" },
          "42": { repo: " owner/repo ", data: { number: " 42 " }, id: "match" },
          "43": { repo: "other/repo", prNumber: "42" },
        },
      }),
    ).toEqual({ repo: " owner/repo ", data: { number: " 42 " }, id: "match" });
  });

  test("given no matching diff row, when finding diff entry by repo and pr number, then undefined is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.findDiffEntry({
        repo: "owner/repo",
        prNumber: "999",
        byPrNumber: {
          "41": { repo: "owner/repo", prNumber: "41" },
        },
      }),
    ).toBeUndefined();
  });

  test("given diff sync result, when building diff success payload, then api response contract fields are normalized", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDiffSuccessPayload({
        repo: "owner/repo",
        prNumber: "101",
        diffResult: {
          source: "cache",
          stale: 0,
          warning: null,
          commitFingerprint: undefined,
          fetchedAt: "2026-01-02T00:00:00.000Z",
          filePath: "/tmp/pr.diff",
          diffText: 42,
        },
      }),
    ).toEqual({
      ok: true,
      repo: "owner/repo",
      prNumber: "101",
      source: "cache",
      stale: false,
      warning: "",
      commitFingerprint: "",
      fetchedAt: "2026-01-02T00:00:00.000Z",
      filePath: "/tmp/pr.diff",
      diffText: "42",
    });
  });

  test("given no diff query contract match, when building invalid diff request result, then status 400 and route error contract are returned", () => {
    const helpers = createHelpers();

    expect(helpers.buildDiffInvalidRequestResult()).toEqual({
      statusCode: 400,
      error: "Invalid repo or prNumber",
    });
  });

  test("given repo and pr number with no stored row, when building diff not-found result, then status 404 and route error contract are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDiffNotFoundResult({ repo: "owner/repo", prNumber: "77" }),
    ).toEqual({
      statusCode: 404,
      error: "PR #77 not found for repo owner/repo",
    });
  });

  test("given diff sync failure state, when building diff failure result, then status 500 uses explicit error or fallback message", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDiffSyncFailureResult({ error: "upstream failure" }),
    ).toEqual({
      statusCode: 500,
      error: "upstream failure",
    });

    expect(helpers.buildDiffSyncFailureResult({})).toEqual({
      statusCode: 500,
      error: "Failed to retrieve diff",
    });
  });

  test("given successful diff sync data, when building diff sync route result, then a 200 route-result contract with normalized payload is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDiffSyncRouteResult({
        repo: "owner/repo",
        prNumber: "88",
        diffResult: {
          ok: true,
          source: "cache",
          stale: 1,
          warning: "cached",
          commitFingerprint: "fp-1",
          fetchedAt: "2026-01-02T00:00:00.000Z",
          filePath: "/tmp/pr.diff",
          diffText: "diff --git",
        },
      }),
    ).toEqual({
      responseStatusCode: 200,
      responsePayload: {
        ok: true,
        repo: "owner/repo",
        prNumber: "88",
        source: "cache",
        stale: true,
        warning: "cached",
        commitFingerprint: "fp-1",
        fetchedAt: "2026-01-02T00:00:00.000Z",
        filePath: "/tmp/pr.diff",
        diffText: "diff --git",
      },
    });
  });

  test("given failed diff sync data, when building diff sync route result, then a 500 route-result contract with error payload is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDiffSyncRouteResult({
        repo: "owner/repo",
        prNumber: "88",
        diffResult: {
          ok: false,
          error: "sync failed",
        },
      }),
    ).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        error: "sync failed",
      },
    });
  });

  test("given invalid diff query values, when resolving diff request result, then invalid-request error result is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.resolveDiffRequestResult({
        query: { repo: "owner-only", prNumber: "abc" },
        byPrNumber: {},
      }),
    ).toEqual({
      ok: false,
      statusCode: 400,
      error: "Invalid repo or prNumber",
    });
  });

  test("given no matching stored diff row, when resolving diff request result, then not-found error result is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.resolveDiffRequestResult({
        query: { repo: "owner/repo", prNumber: "77" },
        byPrNumber: {},
      }),
    ).toEqual({
      ok: false,
      statusCode: 404,
      error: "PR #77 not found for repo owner/repo",
    });
  });

  test("given valid diff query and stored row, when resolving diff request result, then normalized repo, pr number, and matched entry are returned", () => {
    const helpers = createHelpers();
    const matchingEntry = { repo: "owner/repo", data: { number: "77" }, id: "match" };

    expect(
      helpers.resolveDiffRequestResult({
        query: { repo: " owner/repo ", prNumber: " 77 " },
        byPrNumber: {
          "77": matchingEntry,
        },
      }),
    ).toEqual({
      ok: true,
      repo: "owner/repo",
      prNumber: "77",
      entry: matchingEntry,
    });
  });

  test("given author-comments query payload, when parsing request, then author login is normalized", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseAuthorCommentsQueryRequest({
        authorLogin: " octocat ",
      }),
    ).toEqual({
      authorLogin: "octocat",
    });
  });

  test("given author-comment create payload, when parsing request, then author login and note are normalized while sentiment is preserved", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseAuthorCommentCreateRequest({
        authorLogin: " octocat ",
        note: 123,
        sentiment: "Positive",
      }),
    ).toEqual({
      authorLogin: "octocat",
      note: "123",
      sentiment: "Positive",
    });
  });

  test("given author-comment update payload, when parsing request, then author login and comment id are normalized", () => {
    const helpers = createHelpers();

    expect(
      helpers.parseAuthorCommentUpdateRequest({
        authorLogin: " octocat ",
        id: " c-123 ",
        note: "hello",
        sentiment: "Negative",
      }),
    ).toEqual({
      authorLogin: "octocat",
      commentId: "c-123",
      note: "hello",
      sentiment: "Negative",
    });
  });

  test("given possible note values, when checking non-empty trimmed string, then only non-empty trimmed values are accepted", () => {
    const helpers = createHelpers();

    expect(helpers.isNonEmptyTrimmedString(" hello ")).toBe(true);
    expect(helpers.isNonEmptyTrimmedString("   ")).toBe(false);
    expect(helpers.isNonEmptyTrimmedString("")).toBe(false);
  });

  test("given author-comment create inputs, when building create validation error, then required field error contracts are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentCreateValidationError({
        authorLogin: "",
        note: "hello",
      }),
    ).toBe("Invalid authorLogin");

    expect(
      helpers.buildAuthorCommentCreateValidationError({
        authorLogin: "octocat",
        note: "   ",
      }),
    ).toBe("Comment note is required");

    expect(
      helpers.buildAuthorCommentCreateValidationError({
        authorLogin: "octocat",
        note: "hello",
      }),
    ).toBeNull();
  });

  test("given author-comment update inputs, when building update validation error, then invalid login/id/note error contracts are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentUpdateValidationError({
        authorLogin: "",
        commentId: "c-1",
        note: "hello",
      }),
    ).toBe("Invalid authorLogin");

    expect(
      helpers.buildAuthorCommentUpdateValidationError({
        authorLogin: "octocat",
        commentId: "",
        note: "hello",
      }),
    ).toBe("Invalid comment id");

    expect(
      helpers.buildAuthorCommentUpdateValidationError({
        authorLogin: "octocat",
        commentId: "c-1",
        note: "   ",
      }),
    ).toBe("Comment note is required");

    expect(
      helpers.buildAuthorCommentUpdateValidationError({
        authorLogin: "octocat",
        commentId: "c-1",
        note: "hello",
      }),
    ).toBeNull();
  });

  test("given missing author entry, when resolving author-comment update target, then author-not-found error contract is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.resolveAuthorCommentUpdateTarget({
        byAuthorLogin: {},
        authorLogin: "octocat",
        commentId: "c-1",
      }),
    ).toEqual({
      error: "Author comments not found",
    });
  });

  test("given unknown comment id, when resolving author-comment update target, then comment-not-found error contract is returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.resolveAuthorCommentUpdateTarget({
        byAuthorLogin: {
          octocat: {
            comments: [{ id: "c-1", note: "hello" }],
          },
        },
        authorLogin: "octocat",
        commentId: "c-2",
      }),
    ).toEqual({
      error: "Comment not found",
    });
  });

  test("given existing author comment, when resolving author-comment update target, then comments, index, and existing comment are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.resolveAuthorCommentUpdateTarget({
        byAuthorLogin: {
          octocat: {
            comments: [{ id: "c-1", note: "hello" }, { id: "c-2", note: "bye" }],
          },
        },
        authorLogin: "octocat",
        commentId: "c-2",
      }),
    ).toEqual({
      error: null,
      comments: [{ id: "c-1", note: "hello" }, { id: "c-2", note: "bye" }],
      commentIndex: 1,
      existingComment: { id: "c-2", note: "bye" },
    });
  });

  test("given comments and a replacement comment, when building updated author comments, then a copied array with the replacement at index is returned", () => {
    const helpers = createHelpers();
    const comments = [{ id: "c-1", note: "hello" }, { id: "c-2", note: "bye" }];

    const updated = helpers.buildUpdatedAuthorComments({
      comments,
      commentIndex: 1,
      normalizedComment: { id: "c-2", note: "updated" },
    });

    expect(updated).toEqual([
      { id: "c-1", note: "hello" },
      { id: "c-2", note: "updated" },
    ]);
    expect(updated).not.toBe(comments);
  });

  test("given no existing author entry, when appending author comment, then new author entry is created with appended comment", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentsWithAppendedComment({
        byAuthorLogin: {},
        authorLogin: "octocat",
        normalizedComment: { id: "c-1", note: "hello" },
      }),
    ).toEqual({
      updatedByAuthorLogin: {
        octocat: {
          comments: [{ id: "c-1", note: "hello" }],
        },
      },
      comments: [{ id: "c-1", note: "hello" }],
    });
  });

  test("given existing author comments, when appending author comment, then returned comments include prior entries plus appended comment", () => {
    const helpers = createHelpers();
    const byAuthorLogin = {
      octocat: {
        comments: [{ id: "c-1", note: "hello" }],
      },
      hubot: {
        comments: [{ id: "h-1", note: "existing" }],
      },
    };

    const result = helpers.buildAuthorCommentsWithAppendedComment({
      byAuthorLogin,
      authorLogin: "octocat",
      normalizedComment: { id: "c-2", note: "new" },
    });

    expect(result).toEqual({
      updatedByAuthorLogin: {
        octocat: {
          comments: [
            { id: "c-1", note: "hello" },
            { id: "c-2", note: "new" },
          ],
        },
        hubot: {
          comments: [{ id: "h-1", note: "existing" }],
        },
      },
      comments: [
        { id: "c-1", note: "hello" },
        { id: "c-2", note: "new" },
      ],
    });
  });

  test("given author login and comments list, when building author-comments list success payload, then ok payload matches GET contract", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentsListSuccessPayload({
        authorLogin: "octocat",
        comments: [{ id: "c-1", note: "hello" }],
      }),
    ).toEqual({
      ok: true,
      authorLogin: "octocat",
      comments: [{ id: "c-1", note: "hello" }],
    });
  });

  test("given author mutation details, when building author-comment mutation success payload, then ok payload matches POST and PUT contracts", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentMutationSuccessPayload({
        authorLogin: "octocat",
        normalizedComment: { id: "c-2", note: "updated" },
        comments: [{ id: "c-1", note: "hello" }, { id: "c-2", note: "updated" }],
      }),
    ).toEqual({
      ok: true,
      authorLogin: "octocat",
      comment: { id: "c-2", note: "updated" },
      comments: [{ id: "c-1", note: "hello" }, { id: "c-2", note: "updated" }],
    });
  });

  test("given author-comment action log inputs, when building action-log detail payload, then author, comment, and file fields are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentActionLogDetail({
        authorLogin: "octocat",
        commentId: "c-22",
        filePath: "/tmp/author-comments.json",
      }),
    ).toEqual({
      authorLogin: "octocat",
      commentId: "c-22",
      file: "/tmp/author-comments.json",
    });
  });

  test("given author-comment action log context, when building action-log entry payload, then action, timing, and detail contracts are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAuthorCommentActionLogEntry({
        action: "put/author-comments",
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 55,
        authorLogin: "octocat",
        commentId: "c-22",
        filePath: "/tmp/author-comments.json",
      }),
    ).toEqual({
      action: "put/author-comments",
      triggeredAt: "2026-01-01T00:00:00.000Z",
      durationMs: 55,
      ok: true,
      detail: {
        authorLogin: "octocat",
        commentId: "c-22",
        file: "/tmp/author-comments.json",
      },
    });
  });
});
