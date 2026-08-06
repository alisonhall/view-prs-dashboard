(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsAuthorInsightsIdentityHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrAuthorInsightsIdentityHelpers = ({
    normalizeActorLogin,
    resolveActorDisplayName,
    getLatestActorsMap,
  } = {}) => {
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallback) =>
            String(fallback || login || "").trim();
    const getLatestActorsMapSafe =
      typeof getLatestActorsMap === "function"
        ? getLatestActorsMap
        : () => ({});

    const getAuthorInsightsDisplayName = (authorLogin) => {
      const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
      if (!normalizedAuthorLogin) {
        return "";
      }
      return resolveActorDisplayNameSafe(
        normalizedAuthorLogin,
        getLatestActorsMapSafe() || {},
        normalizedAuthorLogin,
      );
    };

    const noteAuthorMatchesSelection = (
      noteAuthorValue,
      selectedAuthor,
      actorsMap,
    ) => {
      const rawAuthor = String(noteAuthorValue || "").trim();
      if (!rawAuthor || !selectedAuthor) return false;

      const canonicalRawAuthor = normalizeActorLoginSafe(rawAuthor);
      const selectedLogin = String(selectedAuthor.login || "").trim();
      const selectedName = String(selectedAuthor.name || "").trim();
      const resolvedAuthor = resolveActorDisplayNameSafe(
        rawAuthor,
        actorsMap,
        rawAuthor,
      );

      return (
        rawAuthor === selectedLogin ||
        canonicalRawAuthor === selectedLogin ||
        rawAuthor === selectedName ||
        resolvedAuthor === selectedName
      );
    };

    return {
      getAuthorInsightsDisplayName,
      noteAuthorMatchesSelection,
    };
  };

  return {
    createPrAuthorInsightsIdentityHelpers,
  };
});
