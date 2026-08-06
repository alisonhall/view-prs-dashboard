(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAutoRenderBlockingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAutoRenderBlockingHelpers = ({
    normalizePrNumber,
    normalizeActorLogin,
    isAuthorInsightsComposerDraftDirty,
    getAuthorManualCommentsForLogin,
    isAuthorInsightsEditDraftDirty,
    getAuthorInsightsDisplayName,
  } = {}) => {
    const normalizePrNumberSafe =
      typeof normalizePrNumber === "function"
        ? normalizePrNumber
        : (value) => {
            const normalized = String(value || "").trim();
            return /^\d+$/.test(normalized) ? normalized : "";
          };
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();
    const isAuthorInsightsComposerDraftDirtySafe =
      typeof isAuthorInsightsComposerDraftDirty === "function"
        ? isAuthorInsightsComposerDraftDirty
        : () => false;
    const getAuthorManualCommentsForLoginSafe =
      typeof getAuthorManualCommentsForLogin === "function"
        ? getAuthorManualCommentsForLogin
        : () => [];
    const isAuthorInsightsEditDraftDirtySafe =
      typeof isAuthorInsightsEditDraftDirty === "function"
        ? isAuthorInsightsEditDraftDirty
        : () => false;
    const getAuthorInsightsDisplayNameSafe =
      typeof getAuthorInsightsDisplayName === "function"
        ? getAuthorInsightsDisplayName
        : (value) => String(value || "").trim();

    const formatBlockingPrNumbersLabel = (prNumbers, maxVisible = 6) => {
      const normalized = Array.from(
        new Set(
          (Array.isArray(prNumbers) ? prNumbers : [])
            .map(normalizePrNumberSafe)
            .filter(Boolean),
        ),
      ).sort((a, b) => Number(a) - Number(b));

      if (!normalized.length) {
        return "";
      }

      const visible = normalized.slice(0, Math.max(1, Number(maxVisible) || 6));
      const suffix =
        normalized.length > visible.length
          ? ` (+${normalized.length - visible.length} more)`
          : "";
      return `Blocking PRs: ${visible.map((prNumber) => `#${prNumber}`).join(", ")}${suffix}`;
    };

    const getBlockingAuthorInsightsLogins = (authorInsightsState = {}) => {
      const blockingLogins = new Set();

      Object.entries(authorInsightsState.manualCommentDraftByAuthorLogin || {}).forEach(
        ([authorLogin, draft]) => {
          if (isAuthorInsightsComposerDraftDirtySafe(draft)) {
            blockingLogins.add(normalizeActorLoginSafe(authorLogin));
          }
        },
      );

      Object.entries(
        authorInsightsState.manualCommentEditDraftByAuthorLogin || {},
      ).forEach(([authorLogin, draftMap]) => {
        const savedComments = getAuthorManualCommentsForLoginSafe(authorLogin);
        const savedCommentById = new Map(
          savedComments.map((comment) => [String(comment?.id || "").trim(), comment]),
        );

        Object.entries(draftMap || {}).forEach(([commentId, draft]) => {
          const savedComment = savedCommentById.get(String(commentId || "").trim());
          if (
            draft?.isEditing === true &&
            savedComment &&
            isAuthorInsightsEditDraftDirtySafe(savedComment, draft)
          ) {
            blockingLogins.add(normalizeActorLoginSafe(authorLogin));
          }
        });
      });

      return Array.from(blockingLogins)
        .map((authorLogin) => normalizeActorLoginSafe(authorLogin))
        .filter(Boolean)
        .sort((a, b) =>
          getAuthorInsightsDisplayNameSafe(a).localeCompare(
            getAuthorInsightsDisplayNameSafe(b),
          ),
        );
    };

    return {
      formatBlockingPrNumbersLabel,
      getBlockingAuthorInsightsLogins,
    };
  };

  return {
    createPrAutoRenderBlockingHelpers,
  };
});
