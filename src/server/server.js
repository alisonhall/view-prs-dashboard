/**
 * Standalone server for view-prs module
 * Run this from the project root: node view-prs/server.js
 * Or from the view-prs directory: node server.js
 */

const {
  createViewPrsApp,
  initializeScheduler,
  appendActionLogEntry,
} = require("./app.js");

const rawRequestedPort = String(process.env.VIEW_PRS_PORT || "").trim();
const shouldDisableSchedulerStartup = ["1", "true", "yes", "on"].includes(
  String(process.env.VIEW_PRS_DISABLE_SCHEDULER_STARTUP || "")
    .trim()
    .toLowerCase(),
);
const requestedPort =
  rawRequestedPort === ""
    ? 3000
    : /^\d+$/.test(rawRequestedPort)
      ? Number(rawRequestedPort)
      : 3000;

// Create the app
const app = createViewPrsApp();

// Start the server
const server = app.listen(requestedPort, () => {
  // Get the actual port (in case 0 was requested)
  const actualPort = server.address().port;
  const baseUrl = `http://localhost:${actualPort}`;
  console.log(`[view-prs] Standalone server is running on ${baseUrl}`);
  console.log("Open one of these pages in your browser:");
  console.log(`- UI: ${baseUrl}/`);
  console.log(`- PR Data: ${baseUrl}/data`);
  console.log(`- Backfill Status: ${baseUrl}/backfill`);

  appendActionLogEntry({
    action: "server/start",
    triggeredAt: new Date().toISOString(),
    durationMs: 0,
    ok: true,
    detail: { port: actualPort, url: baseUrl },
  });

  // Allow tests to isolate standalone server startup from scheduler side effects.
  if (!shouldDisableSchedulerStartup) {
    // Initialize scheduler after startup logs so startup detection stays fast.
    initializeScheduler();
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[view-prs] SIGTERM received, shutting down gracefully...");
  appendActionLogEntry({
    action: "server/shutdown",
    triggeredAt: new Date().toISOString(),
    durationMs: 0,
    ok: true,
    detail: { signal: "SIGTERM" },
  });
  server.close(() => {
    console.log("[view-prs] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[view-prs] SIGINT received, shutting down gracefully...");
  appendActionLogEntry({
    action: "server/shutdown",
    triggeredAt: new Date().toISOString(),
    durationMs: 0,
    ok: true,
    detail: { signal: "SIGINT" },
  });
  server.close(() => {
    console.log("[view-prs] Server closed");
    process.exit(0);
  });
});

module.exports = { app, server };
