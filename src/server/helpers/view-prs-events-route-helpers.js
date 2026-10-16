// Pure, unit-testable SSE formatting helpers for the /view-prs/events route.
// Kept separate from the route module itself so the byte-exact frame format
// (and the "no id: field" decision - see below) can be tested without a
// live socket.
const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

// Deliberately no `id:` field: this server implements no replay buffer, so
// emitting one would make EventSource send Last-Event-ID on reconnect and
// imply a guarantee ("resume where you left off") that isn't honored.
// Reconnect recovery is the fresh `snapshot` frame instead - see
// buildJobEventsSnapshotPayload.
const formatSseFrame = ({ event, data }) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const formatSseComment = (text = "") => `: ${text}\n\n`;

const createViewPrsEventsRouteHelpers = ({ getViewPrsSchedulerPublicState } = {}) => {
  const getViewPrsSchedulerPublicStateSafe =
    typeof getViewPrsSchedulerPublicState === "function"
      ? getViewPrsSchedulerPublicState
      : () => null;

  const buildJobEventsSnapshotPayload = () => ({
    scheduler: getViewPrsSchedulerPublicStateSafe(),
    at: new Date().toISOString(),
  });

  return {
    SSE_RESPONSE_HEADERS,
    formatSseFrame,
    formatSseComment,
    buildJobEventsSnapshotPayload,
  };
};

module.exports = {
  createViewPrsEventsRouteHelpers,
  SSE_RESPONSE_HEADERS,
  formatSseFrame,
  formatSseComment,
};
