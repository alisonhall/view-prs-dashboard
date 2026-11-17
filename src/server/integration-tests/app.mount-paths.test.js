// Every route answers both with and without /view-prs. The app hub mounts
// this app at /view-prs (app-hub.config.json's mountPath) and Express strips
// that prefix, so a route arrives as "/x" there; run on its own (server.js),
// the page's requests (always "/view-prs/x") arrive as written. A route
// registered with only one of the two 404s in the other setup, and the page
// gets Express's HTML "Cannot PUT" page where it expects JSON ("Unexpected
// token '<'") - as the sources routes did until 600ef93. A request through
// the hub's mount is tested in app.tracked-prs.test.js.
const express = require("express");
const appModule = require("../app.js");

const MOUNT_PATH = "/view-prs";

// Reached at the mount's root on purpose: the page itself, its favicon, and
// the health checks the hub calls (healthPath "/").
const MOUNT_RELATIVE_ONLY = new Set(["/", "/index.html", "/favicon.ico", "/favicon.png", "/health", "/health/deps"]);

// The app's middleware and routes, in order: app._router in Express 4,
// app.router in 5.
const routerLayers = (app) => {
  const router = app._router || app.router;
  if (!router || !Array.isArray(router.stack)) throw new Error("Can't find the app's routes (Express's router has moved?)");
  return router.stack;
};

const registeredRoutes = (app) =>
  routerLayers(app)
    .filter((layer) => layer.route)
    .map((layer) => ({
      methods: Object.keys(layer.route.methods).map((method) => method.toUpperCase()),
      paths: [].concat(layer.route.path),
    }));

// Routers mounted with app.use: their routes aren't in the list above, so
// they'd go unchecked.
const nestedRouters = (app) => routerLayers(app).filter((layer) => !layer.route && layer.name === "router");

// The path each one is missing, if any: "/view-prs/x" without "/x", or the
// other way round.
const missingPaths = ({ paths }) => {
  if (paths.some((routePath) => typeof routePath !== "string")) return ["(a RegExp path: check it by hand)"];
  return paths.flatMap((routePath) => {
    if (MOUNT_RELATIVE_ONLY.has(routePath)) return [];
    const counterpart = routePath.startsWith(`${MOUNT_PATH}/`)
      ? routePath.slice(MOUNT_PATH.length)
      : `${MOUNT_PATH}${routePath}`;
    return paths.includes(counterpart) ? [] : [counterpart];
  });
};

describe("the routes under the app hub's mount", () => {
  let app;
  let routes;
  beforeAll(() => {
    app = appModule.createViewPrsApp({ production: true });
    routes = registeredRoutes(app);
  });

  test("the routes are found (so the check below can't pass by finding none)", () => {
    const allPaths = routes.flatMap((route) => route.paths);
    expect(allPaths).toEqual(expect.arrayContaining(["/data", "/view-prs/data", "/subscriptions", "/view-prs/subscriptions"]));
    expect(routes.length).toBeGreaterThan(30);
  });

  test("every route is registered both with and without /view-prs, apart from the mount-relative ones", () => {
    const problems = routes
      .map((route) => ({ route, missing: missingPaths(route) }))
      .filter(({ missing }) => missing.length > 0)
      .map(({ route, missing }) => `${route.methods.join(",")} ${route.paths.join(" | ")} - missing ${missing.join(", ")}`);

    expect(problems).toEqual([]);
  });

  test("no routes are registered on a nested router, where the check above can't see them", () => {
    expect(nestedRouters(app)).toHaveLength(0);
  });

  test("the checks catch a route registered with only one of the two, and a nested router", () => {
    expect(missingPaths({ paths: ["/view-prs/subscriptions"] })).toEqual(["/subscriptions"]);
    expect(missingPaths({ paths: ["/subscriptions"] })).toEqual(["/view-prs/subscriptions"]);
    expect(missingPaths({ paths: ["/subscriptions", "/view-prs/subscriptions"] })).toEqual([]);
    expect(missingPaths({ paths: ["/health"] })).toEqual([]);

    const withRouter = express();
    withRouter.use("/view-prs/things", express.Router().get("/", (_req, res) => res.json({})));
    expect(nestedRouters(withRouter)).toHaveLength(1);
  });
});
