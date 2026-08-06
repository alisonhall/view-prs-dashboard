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

  const buildDataManifestPayload = ({ manifest }) => ({
    ok: true,
    manifest,
    dataMeta: getViewPrsDataMeta(),
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