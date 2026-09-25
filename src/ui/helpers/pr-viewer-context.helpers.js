// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsViewerContextHelpers fallback.
export const { createPrViewerContextHelpers } = (() => {
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
})();
