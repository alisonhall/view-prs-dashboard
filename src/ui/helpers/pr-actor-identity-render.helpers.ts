import type { PrData } from "../types/pr-data.ts";

// The lower-cased login of whoever is viewing the dashboard: the known
// viewer, else the row's own viewerLogin, else whatever the page shows.
export interface PrActorIdentityRenderDeps {
  normalizeActorLogin?: (value: unknown) => string;
  getCurrentViewerLogin?: () => string;
  inferViewerLoginFromPage?: () => string;
}

const createPrActorIdentityRenderHelpers = ({
  normalizeActorLogin,
  getCurrentViewerLogin,
  inferViewerLoginFromPage,
}: PrActorIdentityRenderDeps = {}) => {
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim();
  const getCurrentViewerLoginSafe =
    typeof getCurrentViewerLogin === "function"
      ? getCurrentViewerLogin
      : () => "";
  const inferViewerLoginFromPageSafe =
    typeof inferViewerLoginFromPage === "function"
      ? inferViewerLoginFromPage
      : () => "";

  const getEffectiveViewerLogin = (row: PrData | null | undefined = {}): string =>
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
