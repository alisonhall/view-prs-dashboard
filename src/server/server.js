/**
 * Standalone server for view-prs module
 * Run this from the project root: node view-prs/server.js
 * Or from the view-prs directory: node server.js
 */

const fs = require("fs");
const path = require("path");

// Local settings (the insights hook script) from an optional, gitignored
// .env in the project folder - see .env.example - so no start command
// needs changing. What's already set in the environment wins.
// Loaded before app.js, which reads its config as it loads. Tests skip the
// project's .env (it's the user's own) unless VIEW_PRS_ENV_FILE names one.
const envFile =
  process.env.VIEW_PRS_ENV_FILE ||
  (process.env.NODE_ENV === "test" ? "" : path.resolve(__dirname, "../../.env"));
if (envFile && fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const {
  createViewPrsApp,
  initializeScheduler,
  appendActionLogEntry,
  viewPrsDataDir,
} = require("./app.js");

const rawRequestedPort = String(
  process.env.VIEW_PRS_PORT || process.env.PORT || "",
).trim();
const shouldDisableSchedulerStartup = ["1", "true", "yes", "on"].includes(
  String(process.env.VIEW_PRS_DISABLE_SCHEDULER_STARTUP || "")
    .trim()
    .toLowerCase(),
);
const requestedPort =
  rawRequestedPort === ""
    ? 9000
    : /^\d+$/.test(rawRequestedPort)
      ? Number(rawRequestedPort)
      : 9000;

// This computer only, by default: the server has no sign-in, and anyone
// who can reach it can read the notes and data, start runs, and apply
// labels on GitHub as this machine's gh account. VIEW_PRS_HOST=0.0.0.0
// opens it to the network.
const requestedHost = String(process.env.VIEW_PRS_HOST || "").trim() || "127.0.0.1";

// Create the app
const app = createViewPrsApp();

// Start the server
const server = app.listen(requestedPort, requestedHost, () => {
  // Get the actual port (in case 0 was requested)
  const actualPort = server.address().port;
  const baseUrl = `http://localhost:${actualPort}`;
  console.log(`[view-prs] Standalone server is running on ${baseUrl}`);
  console.log("Open one of these pages in your browser:");
  console.log(`- UI: ${baseUrl}/`);
  console.log(`- PR Data: ${baseUrl}/data`);
  console.log(`- Backfill Status: ${baseUrl}/backfill`);
  console.log(`Data folder: ${viewPrsDataDir}`);

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
