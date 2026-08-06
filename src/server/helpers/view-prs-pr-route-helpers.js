const createViewPrsPrRouteHelpers = ({ isRepoSlug }) => {
  const toTrimmedString = (value) => String(value || "").trim();

  const isValidPrNumber = (prNumber) =>
    Boolean(prNumber) && /^\d+$/.test(prNumber) && Number(prNumber) >= 1;

  const parseNotesRequest = (body = {}) => ({
    prNumber: toTrimmedString(body.prNumber),
    rawComments: Array.isArray(body.comments) ? body.comments : [],
  });

  const parseDiffRequest = (query = {}) => ({
    repo: toTrimmedString(query.repo),
    prNumber: toTrimmedString(query.prNumber),
  });

  const parseAuthorCommentsQueryRequest = (query = {}) => ({
    authorLogin: toTrimmedString(query.authorLogin),
  });

  const parseAuthorCommentCreateRequest = (body = {}) => ({
    authorLogin: toTrimmedString(body.authorLogin),
    note: String(body.note ?? ""),
    sentiment: body.sentiment,
  });

  const parseAuthorCommentUpdateRequest = (body = {}) => ({
    authorLogin: toTrimmedString(body.authorLogin),
    commentId: toTrimmedString(body.id),
    note: String(body.note ?? ""),
    sentiment: body.sentiment,
  });

  const isNonEmptyTrimmedString = (value) => toTrimmedString(value).length > 0;

  const buildAuthorCommentCreateValidationError = ({ authorLogin, note }) => {
    if (!authorLogin) {
      return "Invalid authorLogin";
    }
    if (!isNonEmptyTrimmedString(note)) {
      return "Comment note is required";
    }
    return null;
  };

  const buildAuthorCommentUpdateValidationError = ({
    authorLogin,
    commentId,
    note,
  }) => {
    if (!authorLogin) {
      return "Invalid authorLogin";
    }
    if (!commentId) {
      return "Invalid comment id";
    }
    if (!isNonEmptyTrimmedString(note)) {
      return "Comment note is required";
    }
    return null;
  };

  const resolveAuthorCommentUpdateTarget = ({
    byAuthorLogin,
    authorLogin,
    commentId,
  }) => {
    const authorEntry = byAuthorLogin?.[authorLogin];
    if (!authorEntry) {
      return {
        error: "Author comments not found",
      };
    }

    const comments = Array.isArray(authorEntry.comments) ? authorEntry.comments : [];
    const commentIndex = comments.findIndex(
      (comment) => toTrimmedString(comment?.id) === commentId,
    );

    if (commentIndex === -1) {
      return {
        error: "Comment not found",
      };
    }

    return {
      error: null,
      comments,
      commentIndex,
      existingComment: comments[commentIndex] || {},
    };
  };

  const buildUpdatedAuthorComments = ({ comments, commentIndex, normalizedComment }) => {
    const updatedComments = comments.slice();
    updatedComments[commentIndex] = normalizedComment;
    return updatedComments;
  };

  const buildAuthorCommentsWithAppendedComment = ({
    byAuthorLogin,
    authorLogin,
    normalizedComment,
  }) => {
    const currentEntry = byAuthorLogin?.[authorLogin] || { comments: [] };
    const currentComments = Array.isArray(currentEntry.comments)
      ? currentEntry.comments
      : [];
    const updatedComments = [...currentComments, normalizedComment];

    return {
      updatedByAuthorLogin: {
        ...byAuthorLogin,
        [authorLogin]: {
          comments: updatedComments,
        },
      },
      comments: updatedComments,
    };
  };

  const buildAuthorCommentsListSuccessPayload = ({ authorLogin, comments }) => ({
    ok: true,
    authorLogin,
    comments,
  });

  const buildAuthorCommentMutationSuccessPayload = ({
    authorLogin,
    normalizedComment,
    comments,
  }) => ({
    ok: true,
    authorLogin,
    comment: normalizedComment,
    comments,
  });

  const buildAuthorCommentActionLogDetail = ({
    authorLogin,
    commentId,
    filePath,
  }) => ({
    authorLogin,
    commentId,
    file: filePath,
  });

  const buildAuthorCommentActionLogEntry = ({
    action,
    startedAt,
    durationMs,
    authorLogin,
    commentId,
    filePath,
  }) => ({
    action,
    triggeredAt: startedAt,
    durationMs,
    ok: true,
    detail: buildAuthorCommentActionLogDetail({
      authorLogin,
      commentId,
      filePath,
    }),
  });

  const findDiffEntry = ({ byPrNumber, repo, prNumber }) =>
    Object.values(byPrNumber || {}).find(
      (rowEntry) =>
        toTrimmedString(rowEntry?.repo) === repo &&
        toTrimmedString(rowEntry?.prNumber || rowEntry?.data?.number) === prNumber,
    );

  const buildDiffSuccessPayload = ({ repo, prNumber, diffResult }) => ({
    ok: true,
    repo,
    prNumber,
    source: diffResult.source,
    stale: Boolean(diffResult.stale),
    warning: diffResult.warning || "",
    commitFingerprint: diffResult.commitFingerprint || "",
    fetchedAt: diffResult.fetchedAt || null,
    filePath: diffResult.filePath || "",
    diffText: String(diffResult.diffText || ""),
  });

  const buildDiffInvalidRequestResult = () => ({
    statusCode: 400,
    error: "Invalid repo or prNumber",
  });

  const buildDiffNotFoundResult = ({ repo, prNumber }) => ({
    statusCode: 404,
    error: `PR #${prNumber} not found for repo ${repo}`,
  });

  const buildDiffSyncFailureResult = ({ error }) => ({
    statusCode: 500,
    error: error || "Failed to retrieve diff",
  });

  const buildDiffSyncRouteResult = ({ repo, prNumber, diffResult }) => {
    if (!diffResult?.ok) {
      const failureResult = buildDiffSyncFailureResult(diffResult || {});
      return {
        responseStatusCode: failureResult.statusCode,
        responsePayload: {
          ok: false,
          error: failureResult.error,
        },
      };
    }

    return {
      responseStatusCode: 200,
      responsePayload: buildDiffSuccessPayload({ repo, prNumber, diffResult }),
    };
  };

  const resolveDiffRequestResult = ({ query, byPrNumber }) => {
    const { repo, prNumber } = parseDiffRequest(query);

    if (!isValidDiffRequest({ repo, prNumber })) {
      return {
        ok: false,
        ...buildDiffInvalidRequestResult(),
      };
    }

    const entry = findDiffEntry({
      byPrNumber,
      repo,
      prNumber,
    });

    if (!entry) {
      return {
        ok: false,
        ...buildDiffNotFoundResult({ repo, prNumber }),
      };
    }

    return {
      ok: true,
      repo,
      prNumber,
      entry,
    };
  };

  const isValidDiffRequest = ({ repo, prNumber }) =>
    isRepoSlug(repo) && /^\d+$/.test(prNumber);

  return {
    parseNotesRequest,
    isValidPrNumber,
    parseDiffRequest,
    isValidDiffRequest,
    parseAuthorCommentsQueryRequest,
    parseAuthorCommentCreateRequest,
    parseAuthorCommentUpdateRequest,
    isNonEmptyTrimmedString,
    buildAuthorCommentCreateValidationError,
    buildAuthorCommentUpdateValidationError,
    resolveAuthorCommentUpdateTarget,
    buildUpdatedAuthorComments,
    buildAuthorCommentsWithAppendedComment,
    buildAuthorCommentsListSuccessPayload,
    buildAuthorCommentMutationSuccessPayload,
    buildAuthorCommentActionLogDetail,
    buildAuthorCommentActionLogEntry,
    findDiffEntry,
    buildDiffSuccessPayload,
    buildDiffInvalidRequestResult,
    buildDiffNotFoundResult,
    buildDiffSyncFailureResult,
    buildDiffSyncRouteResult,
    resolveDiffRequestResult,
  };
};

module.exports = {
  createViewPrsPrRouteHelpers,
};
