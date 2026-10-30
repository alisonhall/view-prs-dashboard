import type { PrEntry } from "../types/pr-data.ts";
import type { ActorLoginAliases, NormalizeActorLogin } from "./pr-actor-identity.helpers.ts";

// The viewer's normalized login and the login-alias map for a data
// payload (PrDataProvider). The login comes from the payload, else any
// row's viewerLogin, else the page text.
export interface PrViewerContextDeps {
  normalizeActorLoginAliases?: (value: unknown) => ActorLoginAliases;
  normalizeActorLogin?: NormalizeActorLogin;
  inferViewerLoginFromPage?: () => string;
}

export interface ViewerContextInput {
  payload?: { actorLoginAliases?: unknown; viewerLogin?: string } | null;
  allEntries?: PrEntry[] | null;
}

export interface ViewerContext {
  currentActorLoginAliases: ActorLoginAliases;
  currentViewerLogin: string;
}

const createPrViewerContextHelpers = ({
  normalizeActorLoginAliases,
  normalizeActorLogin,
  inferViewerLoginFromPage,
}: PrViewerContextDeps = {}) => {
  const normalizeActorLoginAliasesSafe =
    typeof normalizeActorLoginAliases === "function"
      ? normalizeActorLoginAliases
      : (value: unknown): ActorLoginAliases => (value && typeof value === "object" ? (value as ActorLoginAliases) : {});
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim().toLowerCase();
  const inferViewerLoginFromPageSafe =
    typeof inferViewerLoginFromPage === "function"
      ? inferViewerLoginFromPage
      : () => "";

  const deriveViewerContext = ({ payload, allEntries }: ViewerContextInput = {}): ViewerContext => {
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

export { createPrViewerContextHelpers };
