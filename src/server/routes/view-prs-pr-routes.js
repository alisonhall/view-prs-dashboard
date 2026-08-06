const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");
const {
  createViewPrsPrRouteHelpers,
} = require("../helpers/view-prs-pr-route-helpers");

const registerViewPrsPrRoutes = ({
  app,
  normalizeNotes,
  normalizeAuthorComment,
  normalizeAuthorCommentSentiment,
  fs,
  viewPrsDataFile,
  viewPrsAuthorCommentsFile,
  normalizeViewPrsUserState,
  normalizeViewPrsAuthorComments,
  readJsonFileIfExists,
  viewPrsUserStateFile,
  writeViewPrsUserState,
  readViewPrsAuthorComments,
  writeViewPrsAuthorComments,
  appendActionLogEntry,
  readViewPrsData,
  readViewPrsActorLoginAliases,
  resolveCanonicalActorLogin,
  isRepoSlug,
  syncPrDiffForEntry,
}) => {
  const { sendSuccessPayload, sendInternalError, sendErrorStatus, sendRouteResult } =
    createViewPrsRouteResponseHelpers();
  const {
    parseNotesRequest,
    isValidPrNumber,
    parseAuthorCommentsQueryRequest,
    parseAuthorCommentCreateRequest,
    parseAuthorCommentUpdateRequest,
    buildAuthorCommentCreateValidationError,
    buildAuthorCommentUpdateValidationError,
    resolveAuthorCommentUpdateTarget,
    buildUpdatedAuthorComments,
    buildAuthorCommentsWithAppendedComment,
    buildAuthorCommentsListSuccessPayload,
    buildAuthorCommentMutationSuccessPayload,
    buildAuthorCommentActionLogEntry,
    buildDiffSyncRouteResult,
    resolveDiffRequestResult,
  } = createViewPrsPrRouteHelpers({ isRepoSlug });

  const getCanonicalAuthorLogin = (authorLogin) =>
    resolveCanonicalActorLogin(
      authorLogin,
      readViewPrsActorLoginAliases(),
    );

  const normalizeAuthorCommentsStateAliases = (state = {}) => {
    const normalizedState = normalizeViewPrsAuthorComments(state);
    const byAuthorLogin = normalizedState.byAuthorLogin || {};
    const mergedByAuthorLogin = {};
    let changed = false;

    Object.entries(byAuthorLogin).forEach(([authorLogin, authorEntry]) => {
      const canonicalAuthorLogin = getCanonicalAuthorLogin(authorLogin);
      if (!canonicalAuthorLogin) {
        return;
      }
      if (canonicalAuthorLogin !== authorLogin) {
        changed = true;
      }

      const comments = Array.isArray(authorEntry?.comments)
        ? authorEntry.comments
        : [];
      if (!mergedByAuthorLogin[canonicalAuthorLogin]) {
        mergedByAuthorLogin[canonicalAuthorLogin] = { comments: [] };
      }
      mergedByAuthorLogin[canonicalAuthorLogin].comments.push(...comments);
    });

    Object.values(mergedByAuthorLogin).forEach((authorEntry) => {
      authorEntry.comments = Array.isArray(authorEntry.comments)
        ? authorEntry.comments
        : [];
    });

    return {
      changed,
      state: normalizeViewPrsAuthorComments({
        byAuthorLogin: mergedByAuthorLogin,
      }),
    };
  };

  app.post(["/notes", "/view-prs/notes"], (req, res) => {
    const body = req.body || {};
    const { prNumber, rawComments } = parseNotesRequest(body);
    const notesStartedAt = new Date().toISOString();
    const notesTriggerMs = Date.now();

    if (!isValidPrNumber(prNumber)) {
      sendErrorStatus({ res, statusCode: 400, error: "Invalid prNumber" });
      return;
    }

    const noteTimestampsNow = new Date().toISOString();
    const comments = rawComments
      .filter((comment) => comment && typeof comment === "object")
      .map((comment) => ({
        id:
          String(comment.id || "").trim() ||
          `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        author: String(comment.author ?? ""),
        tone: ["Positive", "Negative", "Neutral"].includes(comment.tone)
          ? comment.tone
          : "Neutral",
        note: String(comment.note ?? ""),
        createdAt:
          Number.isFinite(Date.parse(String(comment.createdAt || "").trim()))
            ? String(comment.createdAt).trim()
            : noteTimestampsNow,
        updatedAt:
          Number.isFinite(Date.parse(String(comment.updatedAt || "").trim()))
            ? String(comment.updatedAt).trim()
            : Number.isFinite(Date.parse(String(comment.createdAt || "").trim()))
              ? String(comment.createdAt).trim()
              : noteTimestampsNow,
      }));

    const notes = normalizeNotes({
      comments,
      otherNotes: String(body.otherNotes ?? ""),
      prDifficulty: String(body.prDifficulty ?? ""),
      rallyStories: body.rallyStories,
      rallyLinks: body.rallyLinks,
      analysisOfPr: String(body.analysisOfPr ?? ""),
    });

    try {
      let data = { byPrNumber: {}, lastRun: null };
      if (fs.existsSync(viewPrsDataFile)) {
        data = JSON.parse(fs.readFileSync(viewPrsDataFile, "utf8"));
      }

      if (!data.byPrNumber || !data.byPrNumber[prNumber]) {
        sendErrorStatus({
          res,
          statusCode: 404,
          error: `PR #${prNumber} not found in stored data`,
        });
        return;
      }

      const userState = normalizeViewPrsUserState(
        readJsonFileIfExists(viewPrsUserStateFile, {}),
      );
      userState.notesByPrNumber[prNumber] = notes;
      writeViewPrsUserState(userState);

      appendActionLogEntry({
        action: "post/notes",
        triggeredAt: notesStartedAt,
        durationMs: Date.now() - notesTriggerMs,
        ok: true,
        detail: { prNumber, commentCount: comments.length },
      });
      sendSuccessPayload({ res, payload: { ok: true, prData: readViewPrsData() } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  app.get(["/author-comments", "/view-prs/author-comments"], (req, res) => {
    const { authorLogin: requestedAuthorLogin } = parseAuthorCommentsQueryRequest(
      req.query,
    );
    const authorLogin = getCanonicalAuthorLogin(requestedAuthorLogin);
    if (!authorLogin) {
      sendErrorStatus({ res, statusCode: 400, error: "Invalid authorLogin" });
      return;
    }

    try {
      const { state } = normalizeAuthorCommentsStateAliases(
        readViewPrsAuthorComments(),
      );
      const authorComments =
        state?.byAuthorLogin?.[authorLogin]?.comments || [];
      sendSuccessPayload({
        res,
        payload: buildAuthorCommentsListSuccessPayload({
          authorLogin,
          comments: authorComments,
        }),
      });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  app.post(
    ["/author-comments", "/view-prs/author-comments"],
    (req, res) => {
      const body = req.body || {};
      const createRequest = parseAuthorCommentCreateRequest(body);
      const authorLogin = getCanonicalAuthorLogin(createRequest.authorLogin);
      const { note } = createRequest;
      const sentiment = normalizeAuthorCommentSentiment(createRequest.sentiment);
      const startedAt = new Date().toISOString();
      const triggerMs = Date.now();

      const createValidationError = buildAuthorCommentCreateValidationError({
        authorLogin,
        note,
      });
      if (createValidationError) {
        sendErrorStatus({ res, statusCode: 400, error: createValidationError });
        return;
      }

      try {
        const { state } = normalizeAuthorCommentsStateAliases(
          readViewPrsAuthorComments(),
        );
        const createdAt = new Date().toISOString();
        const normalizedComment = normalizeAuthorComment({
          note,
          sentiment,
          createdAt,
          updatedAt: createdAt,
        });

        const appendResult = buildAuthorCommentsWithAppendedComment({
          byAuthorLogin: state.byAuthorLogin,
          authorLogin,
          normalizedComment,
        });
        state.byAuthorLogin = appendResult.updatedByAuthorLogin;
        writeViewPrsAuthorComments(
          normalizeViewPrsAuthorComments({
            byAuthorLogin: state.byAuthorLogin,
          }),
        );

        appendActionLogEntry(
          buildAuthorCommentActionLogEntry({
            action: "post/author-comments",
            startedAt,
            durationMs: Date.now() - triggerMs,
            authorLogin,
            commentId: normalizedComment.id,
            filePath: viewPrsAuthorCommentsFile,
          }),
        );

        sendSuccessPayload({
          res,
          payload: buildAuthorCommentMutationSuccessPayload({
            authorLogin,
            normalizedComment,
            comments: appendResult.comments,
          }),
        });
      } catch (error) {
        sendInternalError({ res, error });
      }
    },
  );

  app.put(
    ["/author-comments", "/view-prs/author-comments"],
    (req, res) => {
      const body = req.body || {};
      const updateRequest = parseAuthorCommentUpdateRequest(body);
      const authorLogin = getCanonicalAuthorLogin(updateRequest.authorLogin);
      const { commentId, note } = updateRequest;
      const sentiment = normalizeAuthorCommentSentiment(updateRequest.sentiment);
      const startedAt = new Date().toISOString();
      const triggerMs = Date.now();

      const updateValidationError = buildAuthorCommentUpdateValidationError({
        authorLogin,
        commentId,
        note,
      });
      if (updateValidationError) {
        sendErrorStatus({ res, statusCode: 400, error: updateValidationError });
        return;
      }

      try {
        const { state } = normalizeAuthorCommentsStateAliases(
          readViewPrsAuthorComments(),
        );
        const updateTarget = resolveAuthorCommentUpdateTarget({
          byAuthorLogin: state.byAuthorLogin,
          authorLogin,
          commentId,
        });
        if (updateTarget.error) {
          sendErrorStatus({ res, statusCode: 404, error: updateTarget.error });
          return;
        }

        const { comments, commentIndex, existingComment } = updateTarget;

        const updatedAt = new Date().toISOString();
        const normalizedComment = normalizeAuthorComment({
          ...existingComment,
          id: commentId,
          note,
          sentiment,
          createdAt: existingComment.createdAt,
          updatedAt,
        });

        const updatedComments = buildUpdatedAuthorComments({
          comments,
          commentIndex,
          normalizedComment,
        });
        state.byAuthorLogin[authorLogin] = { comments: updatedComments };
        writeViewPrsAuthorComments(
          normalizeViewPrsAuthorComments({
            byAuthorLogin: state.byAuthorLogin,
          }),
        );

        appendActionLogEntry(
          buildAuthorCommentActionLogEntry({
            action: "put/author-comments",
            startedAt,
            durationMs: Date.now() - triggerMs,
            authorLogin,
            commentId,
            filePath: viewPrsAuthorCommentsFile,
          }),
        );

        sendSuccessPayload({
          res,
          payload: buildAuthorCommentMutationSuccessPayload({
            authorLogin,
            normalizedComment,
            comments: updatedComments,
          }),
        });
      } catch (error) {
        sendInternalError({ res, error });
      }
    },
  );

  app.get(["/diff", "/view-prs/diff"], async (req, res) => {
    const diffRequestResult = resolveDiffRequestResult({
      query: req.query,
      byPrNumber: readViewPrsData()?.byPrNumber,
    });

    if (!diffRequestResult.ok) {
      sendErrorStatus({ res, ...diffRequestResult });
      return;
    }

    const { repo, prNumber, entry } = diffRequestResult;

    const diffResult = await syncPrDiffForEntry(entry);
    sendRouteResult({
      res,
      result: buildDiffSyncRouteResult({ repo, prNumber, diffResult }),
    });
  });
};

module.exports = {
  registerViewPrsPrRoutes,
};
