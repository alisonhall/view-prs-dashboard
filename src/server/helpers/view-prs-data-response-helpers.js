// The user state's per-repo maps the page gets (readViewPrsData).
const USER_STATE_MAP_KEYS = [
  "ackByRepo",
  "ackHistoryByRepo",
  "reverifyByRepo",
  "inReviewByRepo",
  "flaggedByRepo",
  "threadChecksByRepo",
  "customSectionsByRepo",
];

const createViewPrsDataResponseHelpers = ({
  getViewPrsDataMeta,
  getViewPrsSchedulerPublicState,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
}) => {
  const buildBackfillFailurePayload = (error) => {
    const message = error?.message || "Backfill status failed";
    return {
      ok: false,
      running: false,
      pid: null,
      logFile: viewPrsBackfillLogFile,
      pidFile: viewPrsBackfillPidFile,
      summary: message,
      output: "",
      error: message,
    };
  };

  const buildDataPayload = ({ data, backfill }) => ({
    ok: true,
    ...data,
    dataMeta: getViewPrsDataMeta(),
    scheduler: getViewPrsSchedulerPublicState(),
    backfill,
  });

  const buildDataMetaPayload = () => ({
    ok: true,
    supportsDataManifest: true,
    ...getViewPrsDataMeta(),
  });

  // With the user state's per-repo maps (readViewPrsData's), which a poll
  // has no rows to carry: an Ack the script cleared, or one made in
  // another tab, reaches the page with them.
  const buildDataManifestPayload = ({ manifest, data }) => ({
    ok: true,
    manifest,
    dataMeta: getViewPrsDataMeta(),
    ...(data
      ? {
          userState: Object.fromEntries(
            USER_STATE_MAP_KEYS.map((key) => [key, data[key] || {}]),
          ),
          // The people's names and logins (data/actors.json): a save in
          // Settings › People changes no row, so they come this way.
          actorMaps: {
            actorsMap: data.actorsMap || {},
            actors: Array.isArray(data.actors) ? data.actors : [],
            actorIdMoves: data.actorIdMoves || {},
          },
          // How many PRs are archived, and the archive's version (a page
          // holding them fetches them again when it moves).
          ...(data.archiveSummary ? { archiveSummary: data.archiveSummary } : {}),
        }
      : {}),
  });

  const buildSchedulerPayload = () => ({
    ok: true,
    scheduler: getViewPrsSchedulerPublicState(),
  });

  const buildDataDeltaPayload = ({ deltaPayload, data }) => ({
    ok: true,
    ...deltaPayload,
    dataMeta: getViewPrsDataMeta(),
    scheduler: getViewPrsSchedulerPublicState(),
    lastRun: data?.lastRun || null,
    lastFullRun: data?.lastFullRun || null,
    lastRunByRepo: data?.lastRunByRepo || {},
    lastFullRunByRepo: data?.lastFullRunByRepo || {},
  });

  return {
    buildBackfillFailurePayload,
    buildDataPayload,
    buildDataMetaPayload,
    buildDataManifestPayload,
    buildSchedulerPayload,
    buildDataDeltaPayload,
  };
};

module.exports = {
  createViewPrsDataResponseHelpers,
};