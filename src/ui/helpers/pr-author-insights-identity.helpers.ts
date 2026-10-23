// Author Insights' name lookups: the selected author's display name, and
// whether a note's free-text author refers to the selected author (by
// login, canonical login, name, or resolved display name).
type ActorsMap = Record<string, unknown>;

export interface PrAuthorInsightsIdentityDeps {
  normalizeActorLogin?: (value: unknown) => string;
  resolveActorDisplayName?: (login: string, actorsMap: ActorsMap, fallbackName?: string) => string;
  getLatestActorsMap?: () => ActorsMap | null | undefined;
}

export interface SelectedAuthor {
  login?: string;
  name?: string;
}

const createPrAuthorInsightsIdentityHelpers = ({
  normalizeActorLogin,
  resolveActorDisplayName,
  getLatestActorsMap,
}: PrAuthorInsightsIdentityDeps = {}) => {
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim().toLowerCase();
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallback?: string) =>
          String(fallback || login || "").trim();
  const getLatestActorsMapSafe =
    typeof getLatestActorsMap === "function"
      ? getLatestActorsMap
      : (): ActorsMap => ({});

  const getAuthorInsightsDisplayName = (authorLogin: unknown): string => {
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
    noteAuthorValue: unknown,
    selectedAuthor: SelectedAuthor | null | undefined,
    actorsMap: ActorsMap,
  ): boolean => {
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

export { createPrAuthorInsightsIdentityHelpers };
