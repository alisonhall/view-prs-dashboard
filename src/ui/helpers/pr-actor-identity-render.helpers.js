// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsActorIdentityRenderHelpers fallback.
export const { createPrActorIdentityRenderHelpers } = (() => {
  const createPrActorIdentityRenderHelpers = ({
    normalizeActorLogin,
    getCurrentViewerLogin,
    inferViewerLoginFromPage,
  } = {}) => {
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim();
    const getCurrentViewerLoginSafe =
      typeof getCurrentViewerLogin === "function"
        ? getCurrentViewerLogin
        : () => "";
    const inferViewerLoginFromPageSafe =
      typeof inferViewerLoginFromPage === "function"
        ? inferViewerLoginFromPage
        : () => "";

    const getEffectiveViewerLogin = (row = {}) =>
      normalizeActorLoginSafe(
        getCurrentViewerLoginSafe() ||
          row?.viewerLogin ||
          inferViewerLoginFromPageSafe() ||
          "",
      ).toLowerCase();

    return {
      getEffectiveViewerLogin,
    };
  };

  return {
    createPrActorIdentityRenderHelpers,
  };
})();
