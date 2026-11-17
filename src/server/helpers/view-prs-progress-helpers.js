// What's running, and how far it's got, for the Activity popover's "Now":
// each background job run (auto refresh, quick check, merged/closed drain)
// and each long request someone started (Run script, Fetch older merged
// PRs, an Ack's refreshes), with what it's counting - PRs or repos - done
// of how many (when known), the repos it's on, and when it started.
//
// In memory only, and bundled with every scheduler frame
// (getViewPrsSchedulerPublicState's `tasks`), so every connected tab sees
// every task - not just the tab that started it. `onChange` pushes a
// frame (the throttled emitSchedulerStateChanged) when one starts, moves
// on or finishes.

// A task handle's methods are safe to call after it finished (they do
// nothing), so a caller's finally can always finish it.
const createViewPrsProgressHelpers = ({
  onChange = () => {},
  now = () => new Date().toISOString(),
} = {}) => {
  const tasks = new Map();
  let nextId = 0;

  const notify = () => {
    try {
      onChange();
    } catch (_error) {
      // Progress is a display aid: it must never fail the work it reports.
    }
  };

  // kind: "autoRefresh" | "quickCheck" | "mergedQueueDrain" | "runScript" |
  //   "olderMerged" | "ackClear"
  // origin: "background" (the scheduler) | "you" (a request someone made)
  // unit: what done/total count - "PR" or "repo".
  const startTask = ({ kind, origin = "background", repos = [], unit = "PR", total = null } = {}) => {
    nextId += 1;
    const id = `${kind}-${nextId}`;
    const task = {
      id,
      kind: String(kind || ""),
      origin: origin === "you" ? "you" : "background",
      repos: (Array.isArray(repos) ? repos : [repos]).map((repo) => String(repo || "").trim()).filter(Boolean),
      unit,
      done: 0,
      total: Number.isFinite(total) && total >= 0 ? total : null,
      startedAt: now(),
    };
    tasks.set(id, task);
    notify();

    const isRunning = () => tasks.has(id);
    return {
      id,
      // One more done (a PR refreshed, a repo checked).
      advance: (count = 1) => {
        if (!isRunning()) return;
        task.done += Number.isFinite(count) ? count : 1;
        notify();
      },
      // How many there are, once known (a total that wasn't at the start).
      setTotal: (total) => {
        if (!isRunning() || !Number.isFinite(total) || total < 0) return;
        task.total = total;
        notify();
      },
      setRepos: (repos) => {
        if (!isRunning()) return;
        task.repos = (Array.isArray(repos) ? repos : []).map((repo) => String(repo || "").trim()).filter(Boolean);
        notify();
      },
      finish: () => {
        if (!tasks.delete(id)) return;
        notify();
      },
    };
  };

  // Oldest first; copies, so a frame isn't changed after it's built.
  const getProgressTasks = () => Array.from(tasks.values(), (task) => ({ ...task, repos: [...task.repos] }));

  // A progressTracker (command-execution-helpers.js's per-PR START/END
  // markers) counting the PRs a script run finishes into `task`.
  const countFinishedPrs = (task) => ({
    onEnd: () => task?.advance(1),
  });

  return { startTask, getProgressTasks, countFinishedPrs };
};

module.exports = { createViewPrsProgressHelpers };
