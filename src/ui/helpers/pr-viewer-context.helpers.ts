import type { PrEntry } from "../types/pr-data.ts";
import { buildActorIndex, type ActorIndex } from "./pr-actor-identity.helpers.ts";

// For a data payload (PrDataProvider): the people, indexed (from its
// `actors`), and the viewer's login - lower-cased, as GitHub's logins are
// compared - from the payload, else any row's viewerLogin, else the page
// text. The login stays a login: the viewer's key (their person's id) is
// worked out from it where it's wanted (getEffectiveViewerKey).
export interface PrViewerContextDeps {
  inferViewerLoginFromPage?: () => string;
}

export interface ViewerContextInput {
  payload?: { actors?: unknown; actorIdMoves?: unknown; viewerLogin?: string } | null;
  allEntries?: PrEntry[] | null;
}

export interface ViewerContext {
  currentActorIndex: ActorIndex;
  currentViewerLogin: string;
}

const createPrViewerContextHelpers = ({ inferViewerLoginFromPage }: PrViewerContextDeps = {}) => {
  const inferViewerLoginFromPageSafe =
    typeof inferViewerLoginFromPage === "function"
      ? inferViewerLoginFromPage
      : () => "";

  const deriveViewerContext = ({ payload, allEntries }: ViewerContextInput = {}): ViewerContext => {
    const safeEntries = Array.isArray(allEntries) ? allEntries : [];
    const viewerLoginFromRows = safeEntries.find(
      (entry) => entry?.data?.viewerLogin,
    )?.data?.viewerLogin;

    return {
      currentActorIndex: buildActorIndex(payload?.actors, payload?.actorIdMoves),
      currentViewerLogin: String(payload?.viewerLogin || viewerLoginFromRows || inferViewerLoginFromPageSafe() || "")
        .trim()
        .toLowerCase(),
    };
  };

  return {
    deriveViewerContext,
  };
};

export { createPrViewerContextHelpers };
