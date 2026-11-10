/**
 * @jest-environment node
 */
const http = require("http");
const { createViewPrsApiForwarder, viewPrsApiForwarderPlugin } = require("./view-prs-api-forwarder");

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(() => resolve()));

const get = (port, path) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      })
      .on("error", reject);
  });

describe("view-prs API forwarder (the Vite dev server's /view-prs)", () => {
  let upstream;
  let upstreamPort;
  let front;
  let frontPort;
  let seen;
  let eventsClosed;
  const big = "x".repeat(6 * 1024 * 1024);

  beforeEach(async () => {
    seen = [];
    eventsClosed = new Promise((resolve) => {
      upstream = http.createServer((req, res) => {
        seen.push({ url: req.url, host: req.headers.host, method: req.method });
        if (req.url === "/view-prs/data") {
          res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(big) + 2 });
          res.end(`"${big}"`);
        } else if (req.url === "/view-prs/events") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("event: snapshot\ndata: {}\n\n");
          req.on("close", resolve);
        } else if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => res.end(JSON.stringify({ echoed: body })));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    upstreamPort = await listen(upstream);
    const forward = createViewPrsApiForwarder({ target: `http://127.0.0.1:${upstreamPort}` });
    front = http.createServer((req, res) => forward(req, res, () => res.end("vite")));
    frontPort = await listen(front);
  });

  afterEach(async () => {
    await close(front);
    upstream.closeAllConnections();
    await close(upstream);
  });

  test("a large response arrives whole, with the app server's headers, as the app server's host", async () => {
    const res = await get(frontPort, "/view-prs/data");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(big.length + 2);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(seen[0].host).toBe(`127.0.0.1:${upstreamPort}`);
  });

  test("a request body is passed on", async () => {
    const body = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: frontPort, path: "/view-prs/ack", method: "POST", headers: { "content-type": "application/json" } }, (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve(text));
      });
      req.on("error", reject);
      req.end('{"prNumber":"5"}');
    });
    expect(JSON.parse(body)).toEqual({ echoed: '{"prNumber":"5"}' });
  });

  test("anything else is Vite's", async () => {
    expect((await get(frontPort, "/index.html")).body).toBe("vite");
    expect((await get(frontPort, "/view-prs-other")).body).toBe("vite");
    expect(seen).toEqual([]);
  });

  test("a stream (the live events) comes through as it's written, and closing it closes the app server's side", async () => {
    const firstChunk = await new Promise((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port: frontPort, path: "/view-prs/events" }, (res) => {
        res.once("data", (chunk) => {
          resolve(chunk.toString());
          req.destroy();
        });
      });
      req.on("error", () => {});
      setTimeout(() => reject(new Error("no event arrived")), 5000);
    });
    expect(firstChunk).toContain("event: snapshot");
    await expect(eventsClosed).resolves.toBeUndefined();
  });

  test("the plugin installs it on the dev server and on vite preview, which shared server.proxy", () => {
    const plugin = viewPrsApiForwarderPlugin({ target: "http://127.0.0.1:1" });
    const dev = { middlewares: { use: jest.fn() } };
    const preview = { middlewares: { use: jest.fn() } };
    plugin.configureServer(dev);
    plugin.configurePreviewServer(preview);
    expect(dev.middlewares.use).toHaveBeenCalledWith(expect.any(Function));
    expect(preview.middlewares.use).toHaveBeenCalledWith(expect.any(Function));
  });

  test("an app server that isn't running: a 502 that says so", async () => {
    const forward = createViewPrsApiForwarder({ target: "http://127.0.0.1:1" });
    const lonely = http.createServer((req, res) => forward(req, res, () => res.end("vite")));
    const port = await listen(lonely);
    try {
      const res = await get(port, "/view-prs/data");
      expect(res.status).toBe(502);
      expect(JSON.parse(res.body)).toEqual({ ok: false, error: expect.stringContaining("didn't answer") });
    } finally {
      await close(lonely);
    }
  });
});
