/**
 * Production mode (NODE_ENV=production, or createViewPrsApp({ production:
 * true })): the UI comes from the build in dist/ui, not src/ui through Vite.
 * A stand-in build directory (VIEW_PRS_UI_BUILD_DIR, read when app.js loads)
 * keeps this independent of whether `npm run build:ui` has run.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-ui-build-"));
fs.mkdirSync(path.join(buildDir, "assets"));
fs.writeFileSync(path.join(buildDir, "index.html"), "<!doctype html><title>built</title>");
fs.writeFileSync(path.join(buildDir, "assets", "main-abc123.js"), "console.log('built');");
process.env.VIEW_PRS_UI_BUILD_DIR = buildDir;

const { createViewPrsApp } = require("../app.js");

describe("createViewPrsApp in production mode", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = createViewPrsApp({ production: true }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(buildDir, { recursive: true, force: true });
    delete process.env.VIEW_PRS_UI_BUILD_DIR;
  });

  test("serves the built index.html at / and /index.html", async () => {
    for (const route of ["/", "/index.html"]) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>built</title>");
    }
  });

  test("serves the build's assets", async () => {
    const response = await fetch(`${baseUrl}/assets/main-abc123.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("built");
  });

  // The build leaves index.html's plain <script>s to the vendored copies.
  test("still serves what the build doesn't copy from src/ui (the vendored scripts)", async () => {
    const response = await fetch(`${baseUrl}/vendor/purify.min.js`);
    expect(response.status).toBe(200);
  });

  test("without a build, the page says how to make one", async () => {
    const indexFile = path.join(buildDir, "index.html");
    const saved = fs.readFileSync(indexFile);
    fs.rmSync(indexFile);
    try {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(503);
      expect(await response.text()).toContain("npm run build:ui");
    } finally {
      fs.writeFileSync(indexFile, saved);
    }
  });
});
