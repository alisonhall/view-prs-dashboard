const {
  createViewPrsEventsRouteHelpers,
  formatSseFrame,
  formatSseComment,
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

  describe("Given formatSseComment", () => {
    test("When called, Then produces a colon-prefixed comment line ignored by EventSource", () => {
      // Act
      const comment = formatSseComment("keep-alive");

      // Assert
      expect(comment).toBe(": keep-alive\n\n");
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
});
