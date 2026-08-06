(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsViewerContextHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrViewerContextHelpers = ({
    normalizeActorLoginAliases,
    normalizeActorLogin,
    inferViewerLoginFromPage,
  } = {}) => {
    const normalizeActorLoginAliasesSafe =
      typeof normalizeActorLoginAliases === "function"
        ? normalizeActorLoginAliases
        : (value) => (value && typeof value === "object" ? value : {});
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim().toLowerCase();
    const inferViewerLoginFromPageSafe =
      typeof inferViewerLoginFromPage === "function"
        ? inferViewerLoginFromPage
        : () => "";

    const deriveViewerContext = ({ payload, allEntries } = {}) => {
      const safeEntries = Array.isArray(allEntries) ? allEntries : [];
      const viewerLoginFromRows = safeEntries.find(
        (entry) => entry?.data?.viewerLogin,
      )?.data?.viewerLogin;

      const currentActorLoginAliases = normalizeActorLoginAliasesSafe(
        payload?.actorLoginAliases || {},
      );
      const currentViewerLogin = normalizeActorLoginSafe(
        payload?.viewerLogin ||
          viewerLoginFromRows ||
          inferViewerLoginFromPageSafe() ||
          "",
      );

      return {
        currentActorLoginAliases,
        currentViewerLogin,
      };
    };

    return {
      deriveViewerContext,
    };
  };

  return {
    createPrViewerContextHelpers,
  };
});
