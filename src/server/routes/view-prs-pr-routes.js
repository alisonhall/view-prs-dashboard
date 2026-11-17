const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");
const {
  createViewPrsPrRouteHelpers,
} = require("../helpers/view-prs-pr-route-helpers");
const {
  buildPrEntryKey,
  findPrEntryKey,
  migrateNotesKeys,
  normalizePrEntryKeys,
  prNumberFromKey,
} = require("../helpers/view-prs-pr-keys");

const NOTE_TONES = ["Positive", "Negative", "Neutral"];
const validIsoOrNull = (value) => {
  const trimmed = String(value || "").trim();
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
};

// POST /notes' comments as they're stored. The Notes tab sends only id,
// author, tone and note, so a comment's timestamps come from its stored
// copy (matched by id): createdAt is kept, and updatedAt moves to `now` only
// when its author, tone or note changed. Timestamps a client does send
// win. A new comment gets `now` for both.
const buildSavedNoteComments = (rawComments, storedComments, now) => {
  const storedById = new Map(
    (Array.isArray(storedComments) ? storedComments : [])
      .filter((comment) => comment && typeof comment === "object" && comment.id)
      .map((comment) => [String(comment.id), comment]),
  );
  return (Array.isArray(rawComments) ? rawComments : [])
    .filter((comment) => comment && typeof comment === "object")
    .map((comment) => {
      const id =
        String(comment.id || "").trim() ||
        `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const author = String(comment.author ?? "");
      const tone = NOTE_TONES.includes(comment.tone) ? comment.tone : "Neutral";
      const note = String(comment.note ?? "");
      const stored = storedById.get(id);
      const createdAt =
        validIsoOrNull(comment.createdAt) || validIsoOrNull(stored?.createdAt) || now;
      const unchanged =
        stored && stored.author === author && stored.tone === tone && stored.note === note;
      const updatedAt =
        validIsoOrNull(comment.updatedAt) ||
        (unchanged ? validIsoOrNull(stored.updatedAt) || createdAt : stored ? now : createdAt);
      return { id, author, tone, note, createdAt, updatedAt };
    });
};

const registerViewPrsPrRoutes = ({
  app,
  normalizeNotes,
  normalizeAuthorComment,
  normalizeAuthorCommentSentiment,
  fs,
  viewPrsDataFile,
  // Archived PRs' rows (app-config.js): notes can be saved for them too.
  viewPrsArchiveFile,
  viewPrsAuthorCommentsFile,
  normalizeViewPrsAuthorComments,
  updateViewPrsUserState,
  readViewPrsAuthorComments,
  writeViewPrsAuthorComments,
  appendActionLogEntry,
  readViewPrsData,
  // With the archived rows, for looking up a PR the page has from the archive.
  readViewPrsDataWithArchive = readViewPrsData,
  // A login's person's id (ignoring case), an id as it is (actors.json).
  resolveActorKey,
  isRepoSlug,
  syncPrDiffForEntry,
  // A PR's description, fetched or from its copy (view-prs-pr-description-cache.js).
  getPrDescription = async () => ({ ok: false, error: "Descriptions aren't available" }),
  // A file uploaded to GitHub in a PR (view-prs-pr-attachment-proxy.js).
  getAttachment = async () => ({ ok: false, statusCode: 404, error: "Attachments aren't available" }),
  runInsightsHookScript,
  // PRs' full detail fields by key (app.js's readViewPrsPrDetails).
  readViewPrsPrDetails,
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

  // The key an author's comments are kept under: their person's id, so
  // each of their logins - and comments kept under a login before - meet.
  const getCanonicalAuthorLogin = (authorLogin) => resolveActorKey(authorLogin);

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

    try {
      let data = { byPrNumber: {}, lastRun: null };
      if (fs.existsSync(viewPrsDataFile)) {
        data = JSON.parse(fs.readFileSync(viewPrsDataFile, "utf8"));
      }

      // The PR by repo and number (two repos can each have a PR with this
      // number); without a repo (an older page), the row with this number.
      const repo = String(body.repo || "").trim();
      // An archived PR's row too (the data file's, for a PR in both).
      // An archive that can't be read: without it, so notes for the other PRs
      // still save.
      let archived = {};
      if (viewPrsArchiveFile && fs.existsSync(viewPrsArchiveFile)) {
        try {
          archived = normalizePrEntryKeys(JSON.parse(fs.readFileSync(viewPrsArchiveFile, "utf8"))?.byPrNumber || {});
        } catch (_error) {
          archived = {};
        }
      }
      const rows = { ...archived, ...normalizePrEntryKeys(data.byPrNumber || {}) };
      const rowKey = repo
        ? findPrEntryKey(rows, repo, prNumber)
        : Object.keys(rows).find((key) => prNumberFromKey(key) === String(prNumber));
      if (!rowKey || !rows[rowKey]) {
        sendErrorStatus({
          res,
          statusCode: 404,
          error: `PR #${prNumber} not found in stored data`,
        });
        return;
      }
      const rowRepo = String(rows[rowKey].repo || repo || "").trim();
      const notesKey = rowRepo ? buildPrEntryKey(rowRepo, prNumber) : String(prNumber);

      // Read and written under the script's lock (updateViewPrsUserState),
      // so a script run's Ack change and this save can't undo each other.
      let comments = [];
      updateViewPrsUserState((userState) => {
        // Notes still keyed by a bare number go to their repo keys first, as
        // when the data is read - one may be another repo's PR #N.
        userState.notesByPrNumber = migrateNotesKeys(
          userState.notesByPrNumber,
          rows,
          String(data.lastFullRun?.repo || data.lastRun?.repo || ""),
        );
        const previousNotes = userState.notesByPrNumber[notesKey];
        comments = buildSavedNoteComments(
          rawComments,
          previousNotes?.comments,
          new Date().toISOString(),
        );
        userState.notesByPrNumber[notesKey] = normalizeNotes({
          comments,
          otherNotes: String(body.otherNotes ?? ""),
          prDifficulty: String(body.prDifficulty ?? ""),
          stories: body.stories,
          // Older clients send these instead of stories.
          rallyStories: body.rallyStories,
          rallyLinks: body.rallyLinks,
          analysisOfPr: String(body.analysisOfPr ?? ""),
        });
        return userState;
      });

      appendActionLogEntry({
        action: "post/notes",
        triggeredAt: notesStartedAt,
        durationMs: Date.now() - notesTriggerMs,
        ok: true,
        detail: { prNumber, repo: rowRepo, commentCount: comments.length },
      });
      sendSuccessPayload({ res, payload: { ok: true, prData: readViewPrsData() } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // Confirming that a thread you started, resolved by someone else, was
  // handled (the Conversations tab's "To check"): its signature then
  // (threadCheckSignature in pr-review-threads.helpers.ts), or with
  // `confirmed: false` the confirmation removed. Kept in the user state's
  // threadChecksByRepo, repo -> PR number -> thread id -> signature.
  app.post(["/thread-checks", "/view-prs/thread-checks"], (req, res) => {
    const body = req.body || {};
    const repo = String(body.repo || "").trim();
    const prNumber = String(body.prNumber ?? "").trim();
    const threadId = String(body.threadId || "").trim();
    const signature = String(body.signature || "").trim();
    const confirmed = body.confirmed !== false;
    const startedAt = new Date().toISOString();
    const triggerMs = Date.now();

    if (!isRepoSlug(repo) || !isValidPrNumber(prNumber) || !threadId || (confirmed && !signature)) {
      sendErrorStatus({ res, statusCode: 400, error: "Needs repo, prNumber, threadId and (to confirm) signature" });
      return;
    }

    try {
      updateViewPrsUserState((userState) => {
        const perRepo = { ...(userState.threadChecksByRepo[repo] || {}) };
        const perPr = { ...(perRepo[prNumber] || {}) };
        if (confirmed) perPr[threadId] = signature;
        else delete perPr[threadId];
        if (Object.keys(perPr).length > 0) perRepo[prNumber] = perPr;
        else delete perRepo[prNumber];
        userState.threadChecksByRepo = { ...userState.threadChecksByRepo, [repo]: perRepo };
        if (Object.keys(perRepo).length === 0) delete userState.threadChecksByRepo[repo];
        return userState;
      });

      appendActionLogEntry({
        action: "post/thread-checks",
        triggeredAt: startedAt,
        durationMs: Date.now() - triggerMs,
        ok: true,
        detail: { prNumber, repo, threadId, confirmed },
      });
      sendSuccessPayload({ res, payload: { ok: true, prData: readViewPrsData() } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // Adding a PR to a custom section (Settings › Appearance's sections, by
  // id), or with `member: false` taking it out: the user state's
  // customSectionsByRepo, repo -> PR number -> section ids. DELETE with a
  // section id alone takes every PR out of it (the section was removed).
  // Both answer with the whole map, which is all that changed.
  const CUSTOM_SECTION_ID = /^[a-z0-9]{1,32}$/;
  const withoutCustomSection = (perPr, sectionId) => (perPr || []).filter((id) => id !== sectionId);
  const sendCustomSections = (res, userState) =>
    sendSuccessPayload({ res, payload: { ok: true, customSectionsByRepo: userState.customSectionsByRepo } });

  app.post(["/custom-section-prs", "/view-prs/custom-section-prs"], (req, res) => {
    const body = req.body || {};
    const sectionId = String(body.sectionId || "").trim();
    const repo = String(body.repo || "").trim();
    const prNumber = String(body.prNumber ?? "").trim();
    const member = body.member !== false;
    const startedAt = new Date().toISOString();
    const triggerMs = Date.now();

    if (!CUSTOM_SECTION_ID.test(sectionId) || !isRepoSlug(repo) || !isValidPrNumber(prNumber)) {
      sendErrorStatus({ res, statusCode: 400, error: "Needs sectionId, repo and prNumber" });
      return;
    }

    try {
      const userState = updateViewPrsUserState((state) => {
        const perRepo = { ...(state.customSectionsByRepo[repo] || {}) };
        const ids = withoutCustomSection(perRepo[prNumber], sectionId);
        if (member) ids.push(sectionId);
        if (ids.length > 0) perRepo[prNumber] = ids;
        else delete perRepo[prNumber];
        state.customSectionsByRepo = { ...state.customSectionsByRepo, [repo]: perRepo };
        if (Object.keys(perRepo).length === 0) delete state.customSectionsByRepo[repo];
        return state;
      });

      appendActionLogEntry({
        action: "post/custom-section-prs",
        triggeredAt: startedAt,
        durationMs: Date.now() - triggerMs,
        ok: true,
        detail: { prNumber, repo, sectionId, member },
      });
      sendCustomSections(res, userState);
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  app.delete(["/custom-section-prs", "/view-prs/custom-section-prs"], (req, res) => {
    const sectionId = String(req.body?.sectionId || "").trim();
    if (!CUSTOM_SECTION_ID.test(sectionId)) {
      sendErrorStatus({ res, statusCode: 400, error: "Needs sectionId" });
      return;
    }

    try {
      const userState = updateViewPrsUserState((state) => {
        const next = {};
        Object.entries(state.customSectionsByRepo).forEach(([repo, perRepo]) => {
          const kept = Object.entries(perRepo)
            .map(([prNumber, ids]) => [prNumber, withoutCustomSection(ids, sectionId)])
            .filter(([, ids]) => ids.length > 0);
          if (kept.length > 0) next[repo] = Object.fromEntries(kept);
        });
        state.customSectionsByRepo = next;
        return state;
      });
      sendCustomSections(res, userState);
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
      byPrNumber: readViewPrsDataWithArchive()?.byPrNumber,
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

  // A PR's description, for the detail pane's Description tab: any PR the
  // page has, archived ones included. A failed fetch with a copy answers
  // with the copy, marked stale; without one it's a 502.
  app.get(["/pr-description", "/view-prs/pr-description"], async (req, res) => {
    const found = resolveDiffRequestResult({ query: req.query, byPrNumber: readViewPrsDataWithArchive()?.byPrNumber });
    if (!found.ok) {
      sendErrorStatus({ res, ...found });
      return;
    }
    try {
      const result = await getPrDescription(found.entry);
      if (!result.ok) {
        sendErrorStatus({ res, statusCode: 502, error: result.error || "Couldn't fetch the description" });
        return;
      }
      sendSuccessPayload({ res, payload: result });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // An image or video uploaded to GitHub in a PR, for the rendered
  // descriptions and comments (pr-markdown-render.helpers.ts): ?url= the
  // attachment link, and the PR it's in (repo, prNumber) for when it has to
  // be found in the PR's rendered bodies. Served from its kept file, with
  // range requests (a video's seeking), and so it can't run as a page
  // if opened on its own (an SVG can hold a script): no sniffing, and a
  // sandboxed policy allowing nothing.
  app.get(["/attachment", "/view-prs/attachment"], async (req, res) => {
    try {
      const result = await getAttachment({
        url: String(req.query?.url || ""),
        repo: String(req.query?.repo || "").trim(),
        prNumber: String(req.query?.prNumber || "").trim(),
      });
      if (!result.ok) {
        sendErrorStatus({ res, statusCode: result.statusCode || 404, error: result.error });
        return;
      }
      res.set({
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      // From disk, so a video can be played from part way (range requests).
      res.sendFile(result.filePath, (error) => {
        if (error && !res.headersSent) sendInternalError({ res, error });
      });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // A PR's full detail - the text the list's rows go without - for the
  // detail pane, the expanded row's summary and the PR JSON window.
  app.get(["/pr-detail", "/view-prs/pr-detail"], (req, res) => {
    const repo = String(req.query?.repo || "").trim();
    const prNumber = String(req.query?.prNumber || "").trim();
    if (!isRepoSlug(repo) || !isValidPrNumber(prNumber)) {
      sendErrorStatus({ res, statusCode: 400, error: "repo (owner/name) and prNumber are required" });
      return;
    }
    try {
      const found = Object.values(readViewPrsPrDetails([{ repo, prNumber }]))[0];
      if (!found) {
        sendErrorStatus({ res, statusCode: 404, error: `No stored PR ${repo}#${prNumber}` });
        return;
      }
      sendSuccessPayload({ res, payload: { ok: true, ...found } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  // Several PRs' full detail at once, for the export.
  const MAX_DETAIL_PRS = 2000;
  app.post(["/pr-details", "/view-prs/pr-details"], (req, res) => {
    const prs = Array.isArray(req.body?.prs) ? req.body.prs : null;
    if (!prs || prs.length > MAX_DETAIL_PRS) {
      sendErrorStatus({ res, statusCode: 400, error: `prs must be a list of up to ${MAX_DETAIL_PRS} { repo, prNumber }` });
      return;
    }
    const valid = prs
      .map((pr) => ({ repo: String(pr?.repo || "").trim(), prNumber: String(pr?.prNumber || "").trim() }))
      .filter(({ repo, prNumber }) => isRepoSlug(repo) && isValidPrNumber(prNumber));
    try {
      sendSuccessPayload({ res, payload: { ok: true, byPrKey: readViewPrsPrDetails(valid) } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });

  app.get(["/insights-hook", "/view-prs/insights-hook"], async (req, res) => {
    const insightsHookRequestResult = resolveDiffRequestResult({
      query: req.query,
      byPrNumber: readViewPrsDataWithArchive()?.byPrNumber,
    });

    if (!insightsHookRequestResult.ok) {
      sendErrorStatus({ res, ...insightsHookRequestResult });
      return;
    }

    const { entry } = insightsHookRequestResult;
    try {
      const { html, error } = await runInsightsHookScript(entry);
      sendSuccessPayload({ res, payload: { ok: true, html, error: error || null } });
    } catch (error) {
      sendInternalError({ res, error });
    }
  });
};

module.exports = {
  buildSavedNoteComments,
  registerViewPrsPrRoutes,
};
