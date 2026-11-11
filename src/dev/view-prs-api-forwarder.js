/**
 * Forwards the page's /view-prs requests from the Vite dev server to the
 * app server, in place of Vite's own `server.proxy`.
 *
 * Vite's proxy (6.4.5, on Node 22) sometimes stops a large response short:
 * the last ~46KB of a 5MB /view-prs/data never arrive and the connection
 * stays open, so the page waits forever - stuck on "Loading…", or with
 * every later poll queued behind stalled downloads. A third of downloads
 * did that in testing; through this plain pipe, none did. It streams, so
 * the live-events connection (/view-prs/events) works through it too.
 */

const http = require("http");

const createViewPrsApiForwarder = ({ target = "http://localhost:9000", prefix = "/view-prs" } = {}) => {
  const { hostname, port } = new URL(target);
  const targetHost = `${hostname}:${port || 80}`;

  // Connect-style middleware: (req, res, next).
  return (req, res, next) => {
    const url = String(req.url || "");
    if (url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith(`${prefix}?`)) {
      next();
      return;
    }
    const upstream = http.request(
      {
        hostname,
        port: port || 80,
        path: url,
        method: req.method,
        // As changeOrigin did: the app server sees its own host.
        headers: { ...req.headers, host: targetHost },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on("error", () => res.destroy());
      },
    );
    upstream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `The app server at ${target} didn't answer: ${error.message}` }));
    });
    // The page went away (a closed tab, an aborted fetch, the live-events
    // connection closing): stop the request to the app server too.
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  };
};

// A Vite plugin adding the forwarder before Vite's own middleware, on the
// dev server and on `vite preview` (npm run preview), which used the same
// server.proxy.
const viewPrsApiForwarderPlugin = (options) => ({
  name: "view-prs-api-forwarder",
  configureServer(server) {
    server.middlewares.use(createViewPrsApiForwarder(options));
  },
  configurePreviewServer(server) {
    server.middlewares.use(createViewPrsApiForwarder(options));
  },
});

module.exports = { createViewPrsApiForwarder, viewPrsApiForwarderPlugin };
