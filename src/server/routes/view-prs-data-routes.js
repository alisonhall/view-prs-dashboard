const { validateActorsInput } = require("../helpers/view-prs-actors-storage");
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
  isObject,
  readUserDefaults,
  writeUserDefaults,
  getViewPrsBackfillPublicState,
  readViewPrsData,
  // Archived rows in view (app.js's readArchivedViewPrsRows).
  readArchivedViewPrsRows,
  enqueuePrDiffRefreshForData,
  getViewPrsDataMeta,
  getViewPrsDataManifest,
  getViewPrsSchedulerPublicState,
  // The people (createViewPrsActorsStorage): readState / replaceActors.
  actorsStorage,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md's dispatcher
  // plan): lets a person manually reprioritize one (repo, taskType)
  // dispatcher entry to run sooner instead of waiting for its normal
  // due time. Safely no-ops if absent (e.g. in tests that don't wire it).
  bumpDispatcherEntry,
  dispatcherTaskTypes,
  // () => { repos, taskTypes: [{ taskType, intervalMs, priority }] } - the
  // defaults Settings › Background updates shows beside each repo's
  // schedulerRepoConfig (saved through PUT /user-defaults like every other
  // setting). Answers with no repos if absent (e.g. in tests that don't wire it).
  getDispatcherSettings,
  // Per-repo circuit breaker manual reset (see view-prs-scheduler-helpers.js)
  // - e.g. for when a laptop sleep/lock caused a burst of failures that
  // shouldn't count once it's back. Safely no-ops if absent (e.g. in tests
  // that don't wire it).
  resetAutoCircuitBreaker,
  // Pushes a job-agnostic SSE frame carrying a fresh scheduler snapshot
  // (see view-prs-job-events-helpers.js) - called after a successful reset
  // so every connected tab's Activity drawer updates immediately instead
  // of waiting for some UNRELATED job event to happen to carry a fresh
  // snapshot (unlike POST /dispatcher/bump, resetting the circuit breaker
  // has no other side effect that would trigger one on its own). Safely
  // no-ops if absent (e.g. in tests that don't wire it).
  emitSchedulerStateChanged,
}) => {
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
    sendInternalError,
    sendErrorStatus,
  } = createViewPrsRouteResponseHelpers();
  const bumpDispatcherEntrySafe =
    typeof bumpDispatcherEntry === "function" ? bumpDispatcherEntry : () => null;
  const dispatcherTaskTypesSafe = Array.isArray(dispatcherTaskTypes)
    ? dispatcherTaskTypes
    : [];
  const getDispatcherSettingsSafe =
    typeof getDispatcherSettings === "function"
      ? getDispatcherSettings
      : () => ({ repos: [], taskTypes: [] });
  const resetAutoCircuitBreakerSafe =
    typeof resetAutoCircuitBreaker === "function" ? resetAutoCircuitBreaker : () => {};
  const emitSchedulerStateChangedSafe =
    typeof emitSchedulerStateChanged === "function" ? emitSchedulerStateChanged : () => {};
  const { validateJsonObjectBody, validateDataDeltaRequest } =
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

  // The people: GET lists them; PUT replaces them all (Settings › People),
  // refusing a person with no login, a login in two people, or no one at
  // all (a slip that would lose every name set). Logins seen in the data
  // later are added back as people of their own.
  app.get(
    ["/actors", "/view-prs/actors"],
    createSyncHandler({
      handler: (_req, res) => {
        // `unreadable`: the file is there but isn't JSON - no one is listed,
        // and a save keeps a copy of it first.
        const { actors, unreadable } = actorsStorage.readState();
        sendSuccessPayload({ res, payload: { ok: true, actors, unreadable } });
      },
    }),
  );

  app.put(
    ["/actors", "/view-prs/actors"],
    createSyncHandler({
      handler: (req, res) => {
        const body = validateJsonObjectBody({ body: req.body, res });
        if (!body) {
          return;
        }
        const { actors, error } = validateActorsInput(body);
        if (error) {
          sendErrorStatus({ res, statusCode: 400, error });
          return;
        }
        if (actors.length === 0) {
          sendErrorStatus({ res, statusCode: 400, error: "At least one person is required. Clearing everyone is blocked." });
          return;
        }
        sendSuccessPayload({ res, payload: { ok: true, actors: actorsStorage.replaceActors(actors) } });
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

  // Merged and closed PRs past the archive cutoff (archived rows), which
  // /data goes without: the page loads them for "Show older", Review stats
  // reaching back past the cutoff, and Authors.
  app.get(
    ["/archive", "/view-prs/archive"],
    createSyncHandler({
      handler: (_req, res) => {
        sendSuccessPayload({ res, payload: { ok: true, byPrNumber: readArchivedViewPrsRows ? readArchivedViewPrsRows() : {} } });
      },
      fallbackMessage: "Failed to fetch archived PRs",
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
          data,
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

  app.get(
    ["/dispatcher/settings", "/view-prs/dispatcher/settings"],
    createSyncHandler({
      handler: (_req, res) => {
      sendSuccessPayload({ res, payload: { ok: true, ...getDispatcherSettingsSafe() } });
      },
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

  // Manual "Reset circuit breaker" action from the Activity drawer - for
  // when a laptop sleep/lock caused a burst of auto-refresh failures that
  // shouldn't count once it's back (see autoCircuitByRepo's own comment in
  // app.js). Optional { repo } body resets just that one repo's breaker;
  // omitted resets every repo's. Pure in-memory state mutation, no gh/script
  // involvement - same shape as POST /dispatcher/bump.
  app.post(
    ["/circuit-breaker/reset", "/view-prs/circuit-breaker/reset"],
    createSyncHandler({
      handler: (req, res) => {
      const body = isObject(req.body) ? req.body : {};
      const { repo } = body;

      if (repo !== undefined && (typeof repo !== "string" || repo.trim().length === 0)) {
        sendErrorStatus({ res, statusCode: 400, error: "repo, if given, must be a non-empty string" });
        return;
      }

      resetAutoCircuitBreakerSafe(repo ? { repo } : {});
      // Resetting has no OTHER side effect that would naturally trigger a
      // job event (unlike POST /dispatcher/bump, which kicks off a real
      // tick) - push a scheduler-only SSE frame explicitly so every
      // connected tab's Activity drawer updates immediately instead of
      // waiting for some unrelated job event to happen to carry a fresh
      // snapshot.
      emitSchedulerStateChangedSafe();

      sendSuccessPayload({ res, payload: buildSchedulerPayload() });
      },
      fallbackMessage: getDataRouteErrorMessage("circuitBreakerReset"),
    }),
  );
};

module.exports = {
  registerViewPrsDataRoutes,
};
