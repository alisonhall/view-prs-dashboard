// One PR's slice of the user state (notes and the per-repo ack/reverify/
// In Review flags), for PrJsonModal's "User State Entry" view and the
// export helpers.

// repo -> PR number -> value
type RepoPrMap = Record<string, Record<string, unknown> | null | undefined>;

export interface UserStatePayload {
  byPrNumber?: Record<string, { notes?: unknown } | null | undefined>;
  ackByRepo?: RepoPrMap;
  reverifyByRepo?: RepoPrMap;
  inReviewByRepo?: RepoPrMap;
}

export interface PerPrUserState {
  notesByPrNumber: unknown;
  ackByRepo: unknown;
  reverifyByRepo: unknown;
  inReviewByRepo: unknown;
}

export const getPerPrUserStateFromPayload = (
  payload: UserStatePayload | null | undefined,
  entry: { notes?: unknown } | null | undefined,
  prNumber: string | number,
  repo: string | null | undefined,
): PerPrUserState => {
  const byPrNumber = payload?.byPrNumber || {};
  const payloadEntry = byPrNumber?.[prNumber];
  const notes =
    payloadEntry?.notes ||
    entry?.notes ||
    null;

  const readRepoPrValue = (repoMap: RepoPrMap | undefined): unknown => {
    if (!repo || !repoMap || typeof repoMap !== "object") return null;
    const perRepo = repoMap[repo];
    if (!perRepo || typeof perRepo !== "object") return null;
    const value = perRepo[prNumber];
    return value === undefined ? null : value;
  };

  return {
    notesByPrNumber: notes,
    ackByRepo: readRepoPrValue(payload?.ackByRepo),
    reverifyByRepo: readRepoPrValue(payload?.reverifyByRepo),
    inReviewByRepo: readRepoPrValue(payload?.inReviewByRepo),
  };
};
