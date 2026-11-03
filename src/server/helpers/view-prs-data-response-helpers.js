// The user state's per-repo maps the page gets (readViewPrsData).
const USER_STATE_MAP_KEYS = [
  "ackByRepo",
  "ackHistoryByRepo",
  "reverifyByRepo",
  "inReviewByRepo",
  "flaggedByRepo",
  "threadChecksByRepo",
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