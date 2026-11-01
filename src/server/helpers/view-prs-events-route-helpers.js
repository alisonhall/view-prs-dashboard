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

// Pushes "data-changed" when what the page shows moved: checks the data
// version (getDataVersion - the data file, the live summary, the update
// queue) every intervalMs and emits when it differs from the last check.
// That covers what no route reports: a script run writing its rows, a
// quick check's listing and the PRs it queues. Runs only while a page is
// connected (retain/release, one each per connection), from the version
// when the first connected - a page loads the data itself.
const createDataVersionWatcher = ({
  getDataVersion,
  emitDataChanged,
  intervalMs = 3000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  console,
} = {}) => {
  const enabled = typeof getDataVersion === "function" && typeof emitDataChanged === "function";
  let holders = 0;
  let timer = null;
  let lastVersion = null;

  // null when it can't be read; the next check that can, compares.
  const readVersion = () => {
    try {
      return String(getDataVersion() ?? "");
    } catch (error) {
      console?.error?.("[view-prs] data version check failed", error);
      return null;
    }
  };

  const check = () => {
    const version = readVersion();
    if (version === null || version === lastVersion) {
      return;
    }
    const previous = lastVersion;
    lastVersion = version;
    if (previous !== null) {
      emitDataChanged({ dataVersion: version });
    }
  };

  const retain = () => {
    holders += 1;
    if (!enabled || timer) {
      return;
    }
    lastVersion = readVersion();
    timer = setIntervalFn(check, intervalMs);
    timer?.unref?.();
  };

  const release = () => {
    holders = Math.max(0, holders - 1);
    if (holders === 0 && timer) {
      clearIntervalFn(timer);
      timer = null;
      lastVersion = null;
    }
  };

  return { retain, release, check, isRunning: () => timer !== null };
};

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
  createDataVersionWatcher,
  SSE_RESPONSE_HEADERS,
  formatSseFrame,
  formatSseComment,
};
