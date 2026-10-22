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

export { createPrActorIdentityRenderHelpers };
