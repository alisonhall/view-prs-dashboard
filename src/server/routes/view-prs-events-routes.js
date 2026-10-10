const {
  createViewPrsEventsRouteHelpers,
} = require("../helpers/view-prs-events-route-helpers");

// Registers the SSE endpoint the activity drawer's JobEventsProvider
// connects to. Deliberately NOT wrapped in createSyncHandler/
// createAsyncHandler - those wrappers call res.status(500).json(...) on
// error, which throws ERR_HTTP_HEADERS_SENT once writeHead has already
// started a stream. This handler owns its own try/catch/cleanup instead.
const registerViewPrsEventsRoutes = ({
  app,
  subscribeToJobEvents,
  getJobEventsSubscriberCount,
  getViewPrsSchedulerPublicState,
  console,
  heartbeatIntervalMs = 25000,
  maxClients = 25,
}) => {
  const consoleSafe = console || globalThis.console;
  const { SSE_RESPONSE_HEADERS, formatSseFrame, formatSseComment, buildJobEventsSnapshotPayload } =
    createViewPrsEventsRouteHelpers({ getViewPrsSchedulerPublicState });

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

      heartbeatTimer = setInterval(() => {
        safeWrite(formatSseComment("keep-alive"));
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
