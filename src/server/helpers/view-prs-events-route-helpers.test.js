const {
  createViewPrsEventsRouteHelpers,
  createDataVersionWatcher,
  formatSseFrame,
  SSE_RESPONSE_HEADERS,
} = require("./view-prs-events-route-helpers");

describe("View Prs Events Route Helpers", () => {
  describe("Given formatSseFrame", () => {
    test("When called, Then produces an event/data pair ending in a blank line", () => {
      // Act
      const frame = formatSseFrame({ event: "job", data: { job: "autoRefresh" } });

      // Assert
      expect(frame).toBe('event: job\ndata: {"job":"autoRefresh"}\n\n');
    });

    test("When data contains a newline, Then JSON.stringify escapes it so the frame stays single-line", () => {
      // Act
      const frame = formatSseFrame({ event: "job", data: { message: "line one\nline two" } });

      // Assert
      expect(frame).toBe('event: job\ndata: {"message":"line one\\nline two"}\n\n');
      // The data line itself (second of the 4 \n-split segments, the last
      // two being the frame's trailing blank-line terminator) must contain
      // no literal newline - only the escaped "\\n" JSON.stringify produced.
      expect(frame.split("\n")[1]).not.toContain("\n");
    });
  });

  describe("Given SSE_RESPONSE_HEADERS", () => {
    test("When read, Then disables buffering/caching and keeps the connection alive", () => {
      expect(SSE_RESPONSE_HEADERS["Content-Type"]).toBe("text/event-stream; charset=utf-8");
      expect(SSE_RESPONSE_HEADERS["Cache-Control"]).toBe("no-cache, no-transform");
      expect(SSE_RESPONSE_HEADERS.Connection).toBe("keep-alive");
      expect(SSE_RESPONSE_HEADERS["X-Accel-Buffering"]).toBe("no");
    });
  });

  describe("Given buildJobEventsSnapshotPayload", () => {
    test("When getViewPrsSchedulerPublicState is provided, Then the payload bundles its result plus an ISO timestamp", () => {
      // Arrange
      const { buildJobEventsSnapshotPayload } = createViewPrsEventsRouteHelpers({
        getViewPrsSchedulerPublicState: () => ({ isAutoRunInProgress: true }),
      });

      // Act
      const payload = buildJobEventsSnapshotPayload();

      // Assert
      expect(payload.scheduler).toEqual({ isAutoRunInProgress: true });
      expect(typeof payload.at).toBe("string");
      expect(Number.isNaN(Date.parse(payload.at))).toBe(false);
    });

    test("When getViewPrsSchedulerPublicState is missing, Then scheduler is null instead of throwing", () => {
      // Arrange
      const { buildJobEventsSnapshotPayload } = createViewPrsEventsRouteHelpers();

      // Act
      const payload = buildJobEventsSnapshotPayload();

      // Assert
      expect(payload.scheduler).toBeNull();
    });
  });

  describe("Given createDataVersionWatcher", () => {
    const buildWatcher = (versions) => {
      let version = versions[0];
      const timers = [];
      const emitDataChanged = jest.fn();
      const watcher = createDataVersionWatcher({
        getDataVersion: () => {
          if (version instanceof Error) throw version;
          return version;
        },
        emitDataChanged,
        intervalMs: 1000,
        setIntervalFn: (fn, ms) => {
          const timer = { fn, ms, cleared: false };
          timers.push(timer);
          return timer;
        },
        clearIntervalFn: (timer) => {
          timer.cleared = true;
        },
        console: { error: jest.fn() },
      });
      return {
        watcher,
        emitDataChanged,
        timers,
        setVersion: (next) => {
          version = next;
        },
      };
    };

    test("When the version moves while a page is connected, Then it pushes data-changed once per move", () => {
      const { watcher, emitDataChanged, timers, setVersion } = buildWatcher(["v1"]);
      watcher.retain();
      expect(timers).toHaveLength(1);
      expect(timers[0].ms).toBe(1000);

      watcher.check();
      expect(emitDataChanged).not.toHaveBeenCalled();
      setVersion("v2");
      watcher.check();
      watcher.check();
      expect(emitDataChanged).toHaveBeenCalledTimes(1);
      expect(emitDataChanged).toHaveBeenCalledWith({ dataVersion: "v2" });
    });

    test("When pages connect and leave, Then one timer runs while any is connected", () => {
      const { watcher, timers } = buildWatcher(["v1"]);
      watcher.retain();
      watcher.retain();
      expect(timers).toHaveLength(1);
      watcher.release();
      expect(watcher.isRunning()).toBe(true);
      watcher.release();
      expect(watcher.isRunning()).toBe(false);
      expect(timers[0].cleared).toBe(true);
      // Extra releases don't go negative: the next connection starts it again.
      watcher.release();
      watcher.retain();
      expect(timers).toHaveLength(2);
    });

    test("When a page reconnects after none were, Then it starts from the version then", () => {
      const { watcher, emitDataChanged, setVersion } = buildWatcher(["v1"]);
      watcher.retain();
      watcher.release();
      setVersion("v2");
      watcher.retain();
      watcher.check();
      expect(emitDataChanged).not.toHaveBeenCalled();
    });

    test("When the version can't be read, Then nothing is pushed until it can, and compared then", () => {
      const { watcher, emitDataChanged, setVersion } = buildWatcher(["v1"]);
      watcher.retain();
      setVersion(new Error("disk"));
      watcher.check();
      expect(emitDataChanged).not.toHaveBeenCalled();
      setVersion("v2");
      watcher.check();
      expect(emitDataChanged).toHaveBeenCalledWith({ dataVersion: "v2" });
    });

    test("When it isn't given both functions, Then it never starts", () => {
      const watcher = createDataVersionWatcher({ getDataVersion: () => "v1" });
      watcher.retain();
      expect(watcher.isRunning()).toBe(false);
    });
  });
});
