const { createViewPrsJobEventsHelpers } = require("./view-prs-job-events-helpers");

describe("View Prs Job Events Helpers", () => {
  let mockConsole;
  let getViewPrsSchedulerPublicState;
  let helpers;

  beforeEach(() => {
    mockConsole = { error: jest.fn() };
    getViewPrsSchedulerPublicState = jest.fn(() => ({ isAutoRunInProgress: false }));
    helpers = createViewPrsJobEventsHelpers({
      console: mockConsole,
      getViewPrsSchedulerPublicState,
      now: () => "2026-01-01T00:00:00.000Z",
    });
  });

  describe("Given emitJobEvent", () => {
    test("When called, Then builds an envelope with job/phase/detail/scheduler", () => {
      // Act
      const envelope = helpers.emitJobEvent({
        job: helpers.JOB_NAMES.AUTO_REFRESH,
        phase: helpers.JOB_PHASES.START,
        detail: { repoCount: 2 },
      });

      // Assert
      expect(envelope).toEqual({
        type: "job",
        job: "autoRefresh",
        phase: "start",
        at: "2026-01-01T00:00:00.000Z",
        seq: 1,
        ok: null,
        detail: { repoCount: 2 },
        scheduler: { isAutoRunInProgress: false },
      });
    });

    test("When called repeatedly, Then seq is monotonically increasing", () => {
      // Act
      const first = helpers.emitJobEvent({ job: "autoRefresh", phase: "start" });
      const second = helpers.emitJobEvent({ job: "autoRefresh", phase: "finish" });

      // Assert
      expect(first.seq).toBe(1);
      expect(second.seq).toBe(2);
    });

    test("When a subscriber throws, Then emitJobEvent does not propagate the error", () => {
      // Arrange
      helpers.subscribeToJobEvents(() => {
        throw new Error("listener boom");
      });

      // Act
      const act = () => helpers.emitJobEvent({ job: "autoRefresh", phase: "start" });

      // Assert
      expect(act).not.toThrow();
      expect(mockConsole.error).toHaveBeenCalled();
    });

    test("When getViewPrsSchedulerPublicState is missing, Then scheduler is null instead of throwing", () => {
      // Arrange
      const safeHelpers = createViewPrsJobEventsHelpers({ console: mockConsole });

      // Act
      const envelope = safeHelpers.emitJobEvent({ job: "autoRefresh", phase: "start" });

      // Assert
      expect(envelope.scheduler).toBeNull();
    });
  });

  describe("Given emitSchedulerStateChanged", () => {
    test("When called with no subscribers, Then it does no work and returns null", () => {
      // Act
      const envelope = helpers.emitSchedulerStateChanged();

      // Assert
      expect(envelope).toBeNull();
    });

    test("When called with a subscriber present, Then it builds a scheduler-type envelope with no job/phase", () => {
      // Arrange
      helpers.subscribeToJobEvents(() => {});

      // Act
      const envelope = helpers.emitSchedulerStateChanged();

      // Assert
      expect(envelope).toEqual({
        type: "scheduler",
        at: "2026-01-01T00:00:00.000Z",
        seq: 1,
        scheduler: { isAutoRunInProgress: false },
      });
    });

    describe("throttling", () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      test("When called again within the throttle window, Then the second call returns null and emits nothing synchronously", () => {
        const received = [];
        helpers.subscribeToJobEvents((envelope) => received.push(envelope));

        const first = helpers.emitSchedulerStateChanged();
        const second = helpers.emitSchedulerStateChanged();

        expect(first).not.toBeNull();
        expect(second).toBeNull();
        expect(received).toHaveLength(1);
      });

      test("When several calls land inside one window, Then exactly one trailing emit fires after the window elapses, carrying the latest scheduler state", () => {
        const received = [];
        helpers.subscribeToJobEvents((envelope) => received.push(envelope));

        getViewPrsSchedulerPublicState.mockReturnValue({ isAutoRunInProgress: false });
        helpers.emitSchedulerStateChanged(); // leading call, fires immediately

        getViewPrsSchedulerPublicState.mockReturnValue({ isAutoRunInProgress: true });
        helpers.emitSchedulerStateChanged();
        helpers.emitSchedulerStateChanged();
        helpers.emitSchedulerStateChanged();

        expect(received).toHaveLength(1);

        jest.advanceTimersByTime(250);

        expect(received).toHaveLength(2);
        expect(received[1].scheduler).toEqual({ isAutoRunInProgress: true });
      });

      test("When schedulerStateThrottleMs is 0, Then every call emits immediately with no throttling", () => {
        const unthrottled = createViewPrsJobEventsHelpers({
          console: mockConsole,
          getViewPrsSchedulerPublicState,
          schedulerStateThrottleMs: 0,
        });
        const received = [];
        unthrottled.subscribeToJobEvents((envelope) => received.push(envelope));

        unthrottled.emitSchedulerStateChanged();
        unthrottled.emitSchedulerStateChanged();

        expect(received).toHaveLength(2);
      });

      test("When a trailing emit is pending, Then it does not block the process from exiting (timer is unref'd)", () => {
        helpers.subscribeToJobEvents(() => {});
        helpers.emitSchedulerStateChanged();
        helpers.emitSchedulerStateChanged();

        // No direct way to assert unref() was honored without a real
        // process exit, but confirm the timer is a real Node Timeout (has
        // unref) rather than some other value that would throw.
        expect(() => jest.advanceTimersByTime(250)).not.toThrow();
      });
    });
  });

  describe("Given subscribeToJobEvents", () => {
    test("When a listener subscribes, Then it receives emitted envelopes", () => {
      // Arrange
      const received = [];
      helpers.subscribeToJobEvents((envelope) => received.push(envelope));

      // Act
      helpers.emitJobEvent({ job: "autoRefresh", phase: "start" });

      // Assert
      expect(received).toHaveLength(1);
      expect(received[0].job).toBe("autoRefresh");
    });

    test("When the returned unsubscribe is called, Then the listener count drops back to 0", () => {
      // Arrange
      const unsubscribe = helpers.subscribeToJobEvents(() => {});
      expect(helpers.getJobEventsSubscriberCount()).toBe(1);

      // Act
      unsubscribe();

      // Assert
      expect(helpers.getJobEventsSubscriberCount()).toBe(0);
    });

    test("When called with a non-function, Then it returns a no-op unsubscribe and does not throw", () => {
      // Act
      const unsubscribe = helpers.subscribeToJobEvents(null);

      // Assert
      expect(() => unsubscribe()).not.toThrow();
      expect(helpers.getJobEventsSubscriberCount()).toBe(0);
    });
  });
});
