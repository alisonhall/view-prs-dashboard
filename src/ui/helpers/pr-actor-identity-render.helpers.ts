import type { PrData } from "../types/pr-data.ts";
import type { NormalizeActorLogin } from "./pr-actor-identity.helpers.ts";

// Whoever is viewing the dashboard: the known viewer, else the row's own
// viewerLogin, else whatever the page shows.
// - getEffectiveViewerLogin: their login, lower-cased - for comparing with
//   logins as GitHub gives them (a row's assignees, a thread's comments).
// - getEffectiveViewerKey: their person's key (their id, Settings ›
//   People), lower-cased - for comparing with the keys people are grouped
//   by (normalizeActorLogin / getPreferredActorKey), so any of their logins
//   is them.
export interface PrActorIdentityRenderDeps {
  normalizeActorLogin?: NormalizeActorLogin;
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
    String(getCurrentViewerLoginSafe() || row?.viewerLogin || inferViewerLoginFromPageSafe() || "")
      .trim()
      .toLowerCase();

  const getEffectiveViewerKey = (row: PrData | null | undefined = {}): string => {
    const login = getEffectiveViewerLogin(row);
    return login ? normalizeActorLoginSafe(login).toLowerCase() : "";
  };

  return {
    getEffectiveViewerLogin,
    getEffectiveViewerKey,
  };
};

export { createPrActorIdentityRenderHelpers };
