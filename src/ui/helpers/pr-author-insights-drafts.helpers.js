(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsDraftsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = "neutral";

  const createPrAuthorInsightsDraftsHelpers = ({
    authorInsightsState,
    normalizeActorLogin,
  } = {}) => {
    const state =
      authorInsightsState && typeof authorInsightsState === "object"
        ? authorInsightsState
        : {};
    if (!state.manualCommentDraftByAuthorLogin) {
      state.manualCommentDraftByAuthorLogin = {};
    }
    if (!state.manualCommentEditDraftByAuthorLogin) {
      state.manualCommentEditDraftByAuthorLogin = {};
    }
    if (!state.manualCommentsByAuthorLogin) {
      state.manualCommentsByAuthorLogin = {};
    }

    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();

    const normalizeAuthorInsightsSentiment = (value) => {
      const normalized = String(value || DEFAULT_AUTHOR_INSIGHTS_SENTIMENT)
        .trim()
        .toLowerCase();
      return ["positive", "negative", "neutral"].includes(normalized)
        ? normalized
        : DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;
    };

    const createAuthorInsightsComposerDraft = () => ({
      note: "",
      sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
    });

    const getAuthorInsightsComposerDraft = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return createAuthorInsightsComposerDraft();
      }

      const existingDraft =
        state.manualCommentDraftByAuthorLogin[normalizedAuthorLogin];
      if (existingDraft && typeof existingDraft === "object") {
        return existingDraft;
      }

      const nextDraft = createAuthorInsightsComposerDraft();
      state.manualCommentDraftByAuthorLogin[normalizedAuthorLogin] = nextDraft;
      return nextDraft;
    };

    const updateAuthorInsightsComposerDraft = (authorLogin, nextValues = {}) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return createAuthorInsightsComposerDraft();
      }

      const currentDraft = getAuthorInsightsComposerDraft(normalizedAuthorLogin);
      const nextDraft = {
        note:
          Object.prototype.hasOwnProperty.call(nextValues, "note")
            ? String(nextValues.note || "")
            : String(currentDraft.note || ""),
        sentiment:
          Object.prototype.hasOwnProperty.call(nextValues, "sentiment")
            ? normalizeAuthorInsightsSentiment(nextValues.sentiment)
            : normalizeAuthorInsightsSentiment(currentDraft.sentiment),
      };
      state.manualCommentDraftByAuthorLogin[normalizedAuthorLogin] = nextDraft;
      return nextDraft;
    };

    const resetAuthorInsightsComposerDraft = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return;
      }
      state.manualCommentDraftByAuthorLogin[normalizedAuthorLogin] =
        createAuthorInsightsComposerDraft();
    };

    const isAuthorInsightsComposerDraftDirty = (draft = {}) => {
      const note = String(draft.note || "");
      const sentiment = normalizeAuthorInsightsSentiment(draft.sentiment);
      return (
        Boolean(note.trim()) ||
        sentiment !== DEFAULT_AUTHOR_INSIGHTS_SENTIMENT
      );
    };

    const getAuthorInsightsEditDraftMap = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return {};
      }
      const existingDraftMap =
        state.manualCommentEditDraftByAuthorLogin[normalizedAuthorLogin];
      if (existingDraftMap && typeof existingDraftMap === "object") {
        return existingDraftMap;
      }
      const nextDraftMap = {};
      state.manualCommentEditDraftByAuthorLogin[normalizedAuthorLogin] =
        nextDraftMap;
      return nextDraftMap;
    };

    const createAuthorInsightsEditDraft = (comment = {}, overrides = {}) => ({
      note: Object.prototype.hasOwnProperty.call(overrides, "note")
        ? String(overrides.note || "")
        : String(comment?.note || ""),
      sentiment: Object.prototype.hasOwnProperty.call(overrides, "sentiment")
        ? normalizeAuthorInsightsSentiment(overrides.sentiment)
        : normalizeAuthorInsightsSentiment(comment?.sentiment),
      isEditing: overrides.isEditing === true,
    });

    const getAuthorInsightsEditDraft = (authorLogin, comment = {}) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      const commentId = String(comment?.id || "").trim();
      if (!normalizedAuthorLogin || !commentId) {
        return createAuthorInsightsEditDraft(comment);
      }

      const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
      const existingDraft = draftMap[commentId];
      if (existingDraft && typeof existingDraft === "object") {
        return existingDraft;
      }

      const nextDraft = createAuthorInsightsEditDraft(comment);
      draftMap[commentId] = nextDraft;
      return nextDraft;
    };

    const updateAuthorInsightsEditDraft = (
      authorLogin,
      commentId,
      nextValues = {},
    ) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      const normalizedCommentId = String(commentId || "").trim();
      if (!normalizedAuthorLogin || !normalizedCommentId) {
        return null;
      }

      const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
      const currentDraft =
        draftMap[normalizedCommentId] || createAuthorInsightsEditDraft();
      const nextDraft = {
        note:
          Object.prototype.hasOwnProperty.call(nextValues, "note")
            ? String(nextValues.note || "")
            : String(currentDraft.note || ""),
        sentiment:
          Object.prototype.hasOwnProperty.call(nextValues, "sentiment")
            ? normalizeAuthorInsightsSentiment(nextValues.sentiment)
            : normalizeAuthorInsightsSentiment(currentDraft.sentiment),
        isEditing:
          Object.prototype.hasOwnProperty.call(nextValues, "isEditing")
            ? nextValues.isEditing === true
            : currentDraft.isEditing === true,
      };
      draftMap[normalizedCommentId] = nextDraft;
      return nextDraft;
    };

    const resetAuthorInsightsEditDraft = (authorLogin, commentId) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      const normalizedCommentId = String(commentId || "").trim();
      if (!normalizedAuthorLogin || !normalizedCommentId) {
        return;
      }
      const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
      delete draftMap[normalizedCommentId];
    };

    const isAuthorInsightsEditDraftDirty = (comment = {}, draft = {}) => {
      const commentNote = String(comment?.note || "");
      const commentSentiment = normalizeAuthorInsightsSentiment(comment?.sentiment);
      return (
        String(draft.note || "") !== commentNote ||
        normalizeAuthorInsightsSentiment(draft.sentiment) !== commentSentiment
      );
    };

    const getAuthorManualCommentsForLogin = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return [];
      }

      const comments = state.manualCommentsByAuthorLogin?.[normalizedAuthorLogin];
      return Array.isArray(comments) ? comments : [];
    };

    return {
      DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
      normalizeAuthorInsightsSentiment,
      createAuthorInsightsComposerDraft,
      getAuthorInsightsComposerDraft,
      updateAuthorInsightsComposerDraft,
      resetAuthorInsightsComposerDraft,
      isAuthorInsightsComposerDraftDirty,
      getAuthorInsightsEditDraftMap,
      createAuthorInsightsEditDraft,
      getAuthorInsightsEditDraft,
      updateAuthorInsightsEditDraft,
      resetAuthorInsightsEditDraft,
      isAuthorInsightsEditDraftDirty,
      getAuthorManualCommentsForLogin,
    };
  };

  return {
    createPrAuthorInsightsDraftsHelpers,
    DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  };
});
