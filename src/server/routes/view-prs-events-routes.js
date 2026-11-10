const {
  createViewPrsEventsRouteHelpers,
  createDataVersionWatcher,
} = require("../helpers/view-prs-events-route-helpers");

// Registers the SSE endpoint the activity popover's JobEventsProvider
// connects to. Deliberately NOT wrapped in createSyncHandler/
// createAsyncHandler - those wrappers call res.status(500).json(...) on
// error, which throws ERR_HTTP_HEADERS_SENT once writeHead has already
// started a stream. This handler owns its own try/catch/cleanup instead.
//
// While any page is connected, a watcher (createDataVersionWatcher) pushes
// "data-changed" whenever the data version moves - the page fetches the
// changed rows then, rather than on its next poll.
const registerViewPrsEventsRoutes = ({
  app,
  subscribeToJobEvents,
  getJobEventsSubscriberCount,
  getViewPrsSchedulerPublicState,
  console,
  heartbeatIntervalMs = 25000,
  maxClients = 25,
  getDataVersion,
  emitDataChanged,
  dataWatchIntervalMs = 3000,
}) => {
  const consoleSafe = console || globalThis.console;
  const { SSE_RESPONSE_HEADERS, formatSseFrame, buildJobEventsSnapshotPayload } =
    createViewPrsEventsRouteHelpers({ getViewPrsSchedulerPublicState });
  const dataVersionWatcher = createDataVersionWatcher({
    getDataVersion,
    emitDataChanged,
    intervalMs: dataWatchIntervalMs,
    console: consoleSafe,
  });

  app.get(["/events", "/view-prs/events"], (req, res) => {
    const subscriberCountSafe =
      typeof getJobEventsSubscriberCount === "function"
        ? getJobEventsSubscriberCount
        : () => 0;

    if (subscriberCountSafe() >= maxClients) {
      res.status(503).json({ ok: false, error: "Too many event stream clients" });
      return;
    }

    let cleanedUp = false;
    let unsubscribe = () => {};
    let releaseWatcher = () => {};
    let heartbeatTimer = null;

    const safeWrite = (chunk) => {
      if (res.writableEnded) {
        return;
      }
      try {
        res.write(chunk);
      } catch (error) {
        consoleSafe?.error?.("[view-prs] SSE write failed", error);
      }
    };

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      unsubscribe();
      releaseWatcher();
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      if (!res.writableEnded) {
        res.end();
      }
    };

    try {
      res.writeHead(200, SSE_RESPONSE_HEADERS);
      res.flushHeaders?.();

      req.socket.setKeepAlive?.(true);
      req.socket.setNoDelay?.(true);
      res.socket?.setTimeout?.(0);

      safeWrite(formatSseFrame({ event: "snapshot", data: buildJobEventsSnapshotPayload() }));

      unsubscribe = subscribeToJobEvents((envelope) => {
        safeWrite(formatSseFrame({ event: envelope.type || "job", data: envelope }));
      });
      dataVersionWatcher.retain();
      releaseWatcher = () => dataVersionWatcher.release();

      // A named event, not an SSE comment: EventSource never hands a
      // comment to the page, and the page calls live updates stale after a
      // minute without a frame - so with only comments, every quiet minute
      // between background runs showed "Live updates may be stale" over a
      // connection that was fine.
      heartbeatTimer = setInterval(() => {
        safeWrite(formatSseFrame({ event: "heartbeat", data: { at: new Date().toISOString() } }));
      }, heartbeatIntervalMs);
      heartbeatTimer.unref?.();

      req.on("close", cleanup);
      req.on("error", cleanup);
      res.on("error", cleanup);
    } catch (error) {
      consoleSafe?.error?.("[view-prs] SSE handler failed", error);
      cleanup();
    }
  });
};

module.exports = { registerViewPrsEventsRoutes };
