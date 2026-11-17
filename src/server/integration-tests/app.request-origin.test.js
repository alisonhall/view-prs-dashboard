const request = require("supertest");

const appModule = require("../app.js");
appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
const { createViewPrsApp } = appModule;
const { createRequestOriginGuard, isLoopbackHostname, isLoopbackAddress } = require("../helpers/request-origin-guard");

// Other sites' pages can't use the server through the browser: not by
// posting a form or a bodiless fetch to it, and not by pointing their own
// hostname at 127.0.0.1 (DNS rebinding) to read it.
describe("requests from other sites", () => {
  const app = createViewPrsApp({ production: true });

  test("a change from another site's page is refused, and nothing is saved", async () => {
    await request(app)
      .put("/view-prs/user-defaults")
      .send({ theme: "light" })
      .expect(200);

    const refused = await request(app)
      .put("/view-prs/user-defaults")
      .set("Origin", "https://evil.example")
      .send({ theme: "dark" });

    expect(refused.status).toBe(403);
    const saved = await request(app).get("/view-prs/user-defaults").expect(200);
    expect(saved.body.overrides).toEqual({ theme: "light" });
  });

  test("a change from the dashboard's own page (any local port) goes through", async () => {
    for (const origin of ["http://localhost:3456", "http://127.0.0.1:9000", "http://[::1]:4007"]) {
      await request(app)
        .put("/view-prs/user-defaults")
        .set("Origin", origin)
        .send({ from: origin })
        .expect(200);
    }
  });

  test("a sandboxed page or file (Origin: null) can't change anything", async () => {
    await request(app)
      .put("/view-prs/user-defaults")
      .set("Origin", "null")
      .send({ theme: "dark" })
      .expect(403);
  });

  test("a form's fields aren't read: only JSON bodies are", async () => {
    await request(app)
      .put("/view-prs/user-defaults")
      .type("form")
      .send("theme=dark");

    const saved = await request(app).get("/view-prs/user-defaults").expect(200);
    expect(saved.body.overrides).not.toHaveProperty("theme", "dark");
  });

  test("a request naming another host (DNS rebinding) can't read the data", async () => {
    const response = await request(app)
      .get("/view-prs/user-defaults")
      .set("Host", "evil.example:9000");

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty("overrides");
  });
});

describe("createRequestOriginGuard", () => {
  const run = (guard, { method = "GET", host = "localhost:9000", origin } = {}) => {
    const headers = { host };
    if (origin !== undefined) headers.origin = origin;
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    let passed = false;
    guard({ method, headers }, res, () => {
      passed = true;
    });
    return passed ? "passed" : res.statusCode;
  };

  test("opened to the network, any Host is allowed, and a page on the server's own address may change things", () => {
    const guard = createRequestOriginGuard({ allowAnyHost: true });

    expect(run(guard, { host: "192.168.0.5:9000" })).toBe("passed");
    expect(run(guard, { method: "POST", host: "192.168.0.5:9000", origin: "http://192.168.0.5:9000" })).toBe("passed");
    expect(run(guard, { method: "POST", host: "192.168.0.5:9000", origin: "https://evil.example" })).toBe(403);
  });

  test("reads (GET) from another site's page pass the Origin check - the browser keeps the response from it", () => {
    const guard = createRequestOriginGuard();

    expect(run(guard, { origin: "https://evil.example" })).toBe("passed");
  });

  test("names this computer: localhost, its loopback addresses, and *.localhost", () => {
    ["localhost", "127.0.0.1", "::1", "[::1]", "app.localhost"].forEach((name) =>
      expect(isLoopbackHostname(name)).toBe(true),
    );
    ["0.0.0.0", "192.168.0.5", "evil.example", "localhost.evil.example", ""].forEach((name) =>
      expect(isLoopbackHostname(name)).toBe(false),
    );
  });

  test("a connection from this computer: its loopback addresses, IPv4, IPv6 or IPv4 as IPv6", () => {
    ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"].forEach((address) => expect(isLoopbackAddress(address)).toBe(true));
    ["192.168.0.5", "::ffff:192.168.0.5", "10.0.0.127", "fe80::1", "", undefined].forEach((address) =>
      expect(isLoopbackAddress(address)).toBe(false),
    );
  });
});
