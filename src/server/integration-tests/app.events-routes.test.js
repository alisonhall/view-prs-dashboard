const express = require("express");
const { EventEmitter } = require("events");
const { registerViewPrsEventsRoutes } = require("../routes/view-prs-events-routes");

// Deliberately NOT built on createViewPrsApp() - the route's actual
// mechanics (headers, snapshot framing, live job frames, heartbeat,
// maxClients, and subscriber cleanup on abort) don't depend on any of
// app.js's scheduler/data wiring, and a standalone Express app lets every
// test here run in milliseconds instead of needing the full app bootstrap.
// The real wiring (subscribeToJobEvents sharing the same emitter instance
// emitJobEvent uses) is exercised by app.scheduler-events.test.js, which
// spies on the real module.exports.emitJobEvent override.
const createTestServer = ({ heartbeatIntervalMs = 25000, maxClients = 25 } = {}) => {
  const emitter = new EventEmitter();
  const subscribeToJobEvents = (listener) => {
    emitter.on("job-event", listener);
    return () => emitter.off("job-event", listener);
  };
  const getJobEventsSubscriberCount = () => emitter.listenerCount("job-event");
  const emit = (envelope) => emitter.emit("job-event", envelope);

  const app = express();
  registerViewPrsEventsRoutes({
    app,
    subscribeToJobEvents,
    getJobEventsSubscriberCount,
    getViewPrsSchedulerPublicState: () => ({ isAutoRunInProgress: false }),
    console: { error: () => {} },
    heartbeatIntervalMs,
    maxClients,
  });

  const server = app.listen(0);
  return { server, emit, getJobEventsSubscriberCount };
};

const baseUrl = (server) => {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
};

// Reads SSE frames off a fetch Response's streaming body until `until`
// returns true for the accumulated text, or the byte/time budget runs out.
const readFramesUntil = async (response, until, { maxChunks = 50 } = {}) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < maxChunks; i += 1) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
    if (until(text)) {
      return { text, reader };
    }
  }
  return { text, reader };
};

// Polls `check` until it returns true or the deadline passes, instead of
// sleeping a fixed time. The server notices a dropped connection (its
// req "close" handler) only after the abort reaches it, and a fixed 100 ms
// wait here failed once under full-suite load (with a 1 ms wait it fails
// every time). Returns the last result so the caller's assertion still
// reports a clear failure.
const waitForCondition = async (check, { timeoutMs = 5000, intervalMs = 10 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return check();
};

describe("GET /view-prs/events", () => {
  jest.setTimeout(20000);

  test("responds with SSE headers and an immediate snapshot frame", async () => {
    const { server } = createTestServer();
    try {
      const response = await fetch(`${baseUrl(server)}/view-prs/events`);
      expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);

      const { text, reader } = await readFramesUntil(response, (acc) =>
        acc.includes("event: snapshot"),
      );
      expect(text).toContain("event: snapshot");
      expect(text).toContain('"isAutoRunInProgress":false');
      await reader.cancel();
    } finally {
      server.close();
    }
  });

  test("delivers an emitted job event as its own frame", async () => {
    const { server, emit } = createTestServer();
    try {
      const response = await fetch(`${baseUrl(server)}/view-prs/events`);
      const decoder = new TextDecoder();
      // Drain the initial snapshot frame first - read until it's complete
      // (its blank-line terminator), not just the first chunk, which isn't
      // guaranteed to hold the whole frame.
      const snapshot = await readFramesUntil(
        response,
        (acc) => acc.includes("event: snapshot") && acc.includes("\n\n"),
      );
      const { reader } = snapshot;
      let { text } = snapshot;
      expect(text).toContain("event: snapshot");

      emit({ type: "job", job: "autoRefresh", phase: "start", seq: 1 });

      let gotJobFrame = false;
      for (let i = 0; i < 10 && !gotJobFrame; i += 1) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        gotJobFrame = text.includes("event: job");
      }
      expect(gotJobFrame).toBe(true);
      expect(text).toContain('"job":"autoRefresh"');
      await reader.cancel();
    } finally {
      server.close();
    }
  });

  test("rejects a new connection with 503 once maxClients is reached", async () => {
    const { server } = createTestServer({ maxClients: 1 });
    try {
      const firstResponse = await fetch(`${baseUrl(server)}/view-prs/events`);
      expect(firstResponse.headers.get("content-type")).toMatch(/text\/event-stream/);
      const firstReader = firstResponse.body.getReader();
      // Drain the snapshot so the connection is confirmed open before the
      // second request races it.
      await firstReader.read();

      const secondResponse = await fetch(`${baseUrl(server)}/view-prs/events`);
      expect(secondResponse.status).toBe(503);
      const secondPayload = await secondResponse.json();
      expect(secondPayload.ok).toBe(false);

      await firstReader.cancel();
    } finally {
      server.close();
    }
  });

  test("sends a heartbeat comment frame on the configured interval", async () => {
    const { server } = createTestServer({ heartbeatIntervalMs: 50 });
    try {
      const response = await fetch(`${baseUrl(server)}/view-prs/events`);
      const { text, reader } = await readFramesUntil(response, (acc) =>
        acc.includes(": keep-alive"),
      );
      expect(text).toContain(": keep-alive");
      await reader.cancel();
    } finally {
      server.close();
    }
  });

  test("dropping the connection unsubscribes the listener", async () => {
    const { server, getJobEventsSubscriberCount } = createTestServer();
    try {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl(server)}/view-prs/events`, {
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      await reader.read();
      expect(getJobEventsSubscriberCount()).toBe(1);

      controller.abort();
      await waitForCondition(() => getJobEventsSubscriberCount() === 0);

      expect(getJobEventsSubscriberCount()).toBe(0);
    } finally {
      server.close();
    }
  });
});
