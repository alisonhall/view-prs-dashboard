const {
  createViewPrsActorCacheHelpers,
} = require("../helpers/view-prs-actor-cache-helpers");
const {
  createViewPrsDataDeltaHelpers,
} = require("../helpers/view-prs-data-delta-helpers");
const {
  createViewPrsDataResponseHelpers,
} = require("../helpers/view-prs-data-response-helpers");
const {
  createViewPrsDataRouteValidationHelpers,
} = require("../helpers/view-prs-data-route-validation-helpers");
const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");
const {
  createViewPrsDataReadHelpers,
} = require("../helpers/view-prs-data-read-helpers");
const {
  createViewPrsDataRouteErrorHelpers,
} = require("../helpers/view-prs-data-route-error-helpers");
const {
  createViewPrsRouteHandlerHelpers,
} = require("../helpers/view-prs-route-handler-helpers");

const registerViewPrsDataRoutes = ({
  app,
  fs,
  isObject,
  readUserDefaults,
  writeUserDefaults,
  readJsonFileIfExists,
  getViewPrsBackfillPublicState,
  readViewPrsData,
  enqueuePrDiffRefreshForData,
  getViewPrsDataMeta,
  getViewPrsDataManifest,
  getViewPrsSchedulerPublicState,
  viewPrsActorNameCacheFile,
  viewPrsActorLoginAliasesFile,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md's dispatcher
  // plan): lets a person manually reprioritize one (repo, taskType)
  // dispatcher entry to run sooner instead of waiting for its normal
  // due time. Safely no-ops if absent (e.g. in tests that don't wire it).
  bumpDispatcherEntry,
  dispatcherTaskTypes,
}) => {
  const {
    normalizeActorNameCacheEntries,
    normalizeActorLoginAliasEntries,
    readActorNameCacheEntries,
    writeActorNameCacheEntries,
    readActorLoginAliasEntries,
    writeActorLoginAliasEntries,
  } = createViewPrsActorCacheHelpers({
    fs,
    readJsonFileIfExists,
    viewPrsActorNameCacheFile,
    viewPrsActorLoginAliasesFile,
  });
  const { parseRequestedPrNumbers, buildDataDeltaPayload } = createViewPrsDataDeltaHelpers({
    isObject,
  });
  const {
    buildBackfillFailurePayload,
    buildDataPayload,
    buildDataMetaPayload,
    buildDataManifestPayload,
    buildSchedulerPayload,
    buildDataDeltaPayload: buildDataDeltaResponsePayload,
  } = createViewPrsDataResponseHelpers({
    getViewPrsDataMeta,
    getViewPrsSchedulerPublicState,
    viewPrsBackfillLogFile,
    viewPrsBackfillPidFile,
  });
  const {
    runSafely,
    runSafelyAsync,
    sendSuccessPayload,
    sendOk,
    sendEntries,
    sendInternalError,
    sendErrorStatus,
  } = createViewPrsRouteResponseHelpers();
  const bumpDispatcherEntrySafe =
    typeof bumpDispatcherEntry === "function" ? bumpDispatcherEntry : () => null;
  const dispatcherTaskTypesSafe = Array.isArray(dispatcherTaskTypes)
    ? dispatcherTaskTypes
    : [];
  const { validateJsonObjectBody, validateNonEmptyMappings, validateDataDeltaRequest } =
    createViewPrsDataRouteValidationHelpers({ isObject, sendErrorStatus });
  const { readDataWithDiffRefreshEnqueued } = createViewPrsDataReadHelpers({
    readViewPrsData,
    enqueuePrDiffRefreshForData,
  });
  const { getDataRouteErrorMessage } = createViewPrsDataRouteErrorHelpers();
  const { createSyncHandler, createAsyncHandler } = createViewPrsRouteHandlerHelpers({
    runSafely,
    runSafelyAsync,
    sendInternalError,
  });

  app.get(
    ["/user-defaults", "/view-prs/user-defaults"],
    createSyncHandler({
      handler: (_req, res) => {
      const overrides = readUserDefaults();
      sendOk({ res, payload: { overrides } });
      },
    }),
  );

  app.put(
    ["/user-defaults", "/view-prs/user-defaults"],
    createSyncHandler({
      handler: (req, res) => {
      const body = validateJsonObjectBody({ body: req.body, res });
      if (!body) {
        return;
      }

      writeUserDefaults(body);
      sendOk({ res });
      },
    }),
  );

  app.get(
    ["/actor-name-cache", "/view-prs/actor-name-cache"],
    createSyncHandler({
      handler: (_req, res) => {
      const entries = readActorNameCacheEntries();
      sendEntries({ res, entries });
      },
    }),
  );

  app.put(
    ["/actor-name-cache", "/view-prs/actor-name-cache"],
    createSyncHandler({
      handler: (req, res) => {
      const body = validateJsonObjectBody({ body: req.body, res });
      if (!body) {
        return;
      }

      const entries = normalizeActorNameCacheEntries(body);
      if (
        !validateNonEmptyMappings({
          entries,
          res,
          errorMessage:
            "At least one actor name mapping is required. Clearing all mappings is blocked.",
        })
      ) {
        return;
      }

      writeActorNameCacheEntries(entries);
      sendEntries({ res, entries });
      },
    }),
  );

  app.get(
    ["/actor-login-aliases", "/view-prs/actor-login-aliases"],
    createSyncHandler({
      handler: (_req, res) => {
      const entries = readActorLoginAliasEntries();
      sendEntries({ res, entries });
      },
    }),
  );

  app.put(
    ["/actor-login-aliases", "/view-prs/actor-login-aliases"],
    createSyncHandler({
      handler: (req, res) => {
      const body = validateJsonObjectBody({ body: req.body, res });
      if (!body) {
        return;
      }

      const entries = normalizeActorLoginAliasEntries(body);
      if (
        !validateNonEmptyMappings({
          entries,
          res,
          errorMessage:
            "At least one actor login alias mapping is required. Clearing all mappings is blocked.",
        })
      ) {
        return;
      }

      writeActorLoginAliasEntries(entries);
      sendEntries({ res, entries });
      },
    }),
  );

  app.get(
    ["/data", "/view-prs/data"],
    createAsyncHandler({
      handler: async (_req, res) => {
        let backfill;
        try {
          backfill = await getViewPrsBackfillPublicState();
        } catch (error) {
          backfill = buildBackfillFailurePayload(error);
        }

        const data = readDataWithDiffRefreshEnqueued();
        sendSuccessPayload({
          res,
          payload: buildDataPayload({ data, backfill }),
        });
      },
      fallbackMessage: "Failed to fetch data",
    }),
  );

  app.get(
    ["/data-meta", "/view-prs/data-meta"],
    createSyncHandler({
      handler: (_req, res) => {
      sendSuccessPayload({ res, payload: buildDataMetaPayload() });
      },
      fallbackMessage: getDataRouteErrorMessage("dataMeta"),
    }),
  );

  app.get(
    ["/data-manifest", "/view-prs/data-manifest"],
    createSyncHandler({
      handler: (_req, res) => {
      const data = readViewPrsData();
      sendSuccessPayload({
        res,
        payload: buildDataManifestPayload({
          manifest: getViewPrsDataManifest(data),
        }),
      });
      },
      fallbackMessage: getDataRouteErrorMessage("dataManifest"),
    }),
  );

  app.post(
    ["/data-delta", "/view-prs/data-delta"],
    createSyncHandler({
      handler: (_req, res) => {
      if (!validateDataDeltaRequest({ body: _req.body, res })) {
        return;
      }
      const requestedPrNumbers = parseRequestedPrNumbers(_req.body);

      const data = readViewPrsData();
      const deltaPayload = buildDataDeltaPayload({
        data,
        requestedPrNumbers,
      });

      sendSuccessPayload({
        res,
        payload: buildDataDeltaResponsePayload({ deltaPayload, data }),
      });
      },
      fallbackMessage: getDataRouteErrorMessage("dataDelta"),
    }),
  );

  app.get(
    ["/scheduler", "/view-prs/scheduler"],
    createSyncHandler({
      handler: (_req, res) => {
      sendSuccessPayload({ res, payload: buildSchedulerPayload() });
      },
      fallbackMessage: getDataRouteErrorMessage("scheduler"),
    }),
  );

  // Manual "run sooner" reprioritization from the Activity drawer's
  // dispatcher queue - makes one (repo, taskType) entry immediately due
  // and kicks an immediate dispatcher tick, without waiting on it. Returns
  // the fresh scheduler payload (including the updated dispatcherQueue) so
  // the requesting tab sees the reordered queue right away, same as every
  // other mutation route's own-tab synchronous feedback.
  app.post(
    ["/dispatcher/bump", "/view-prs/dispatcher/bump"],
    createSyncHandler({
      handler: (req, res) => {
      const body = isObject(req.body) ? req.body : {};
      const { repo, taskType } = body;

      if (typeof repo !== "string" || repo.trim().length === 0) {
        sendErrorStatus({ res, statusCode: 400, error: "repo is required" });
        return;
      }
      if (!dispatcherTaskTypesSafe.includes(taskType)) {
        sendErrorStatus({
          res,
          statusCode: 400,
          error: `taskType must be one of: ${dispatcherTaskTypesSafe.join(", ")}`,
        });
        return;
      }

      const bumpResult = bumpDispatcherEntrySafe(repo, taskType, {
        reason: "manual-reprioritize",
      });
      if (!bumpResult?.entry) {
        sendErrorStatus({
          res,
          statusCode: 404,
          error: `No dispatcher entry for ${repo} / ${taskType}`,
        });
        return;
      }

      // applied: false means the entry was already due/running before this
      // call, so the bump had no real effect - told apart from a genuine
      // reprioritization rather than reporting ok:true either way (see
      // bumpDispatcherEntry's own comment in app.js).
      sendSuccessPayload({
        res,
        payload: { ...buildSchedulerPayload(), applied: bumpResult.applied },
      });
      },
      fallbackMessage: getDataRouteErrorMessage("dispatcherBump"),
    }),
  );
};

module.exports = {
  registerViewPrsDataRoutes,
};
