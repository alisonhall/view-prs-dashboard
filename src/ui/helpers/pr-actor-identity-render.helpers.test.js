const {
  createPrActorIdentityRenderHelpers,
} = require("./pr-actor-identity-render.helpers.js");

describe("pr actor identity render helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrActorIdentityRenderHelpers({
      normalizeActorLogin: (value) => String(value || "").trim(),
      getCurrentViewerLogin: () => "",
      inferViewerLoginFromPage: () => "",
      ...overrides,
    });

  describe("getEffectiveViewerLogin", () => {
    test("given a current viewer login, when getting the effective viewer login, then it is returned lowercased", () => {
      const helpers = createHelpers({ getCurrentViewerLogin: () => "Alice" });
      expect(helpers.getEffectiveViewerLogin({})).toBe("alice");
    });

    test("given no current viewer login, when getting the effective viewer login, then it falls back to the row's viewerLogin", () => {
      const helpers = createHelpers();
      expect(helpers.getEffectiveViewerLogin({ viewerLogin: "Bob" })).toBe("bob");
    });

    test("given no current viewer login or row viewerLogin, when getting the effective viewer login, then it falls back to inferring from the page", () => {
      const helpers = createHelpers({
        inferViewerLoginFromPage: () => "Carol",
      });
      expect(helpers.getEffectiveViewerLogin({})).toBe("carol");
    });

    test("given no viewer login is resolvable from any source, when getting the effective viewer login, then it returns an empty string", () => {
      const helpers = createHelpers();
      expect(helpers.getEffectiveViewerLogin({})).toBe("");
    });

    test("given a current viewer login, when getting the effective viewer login, then it takes priority over the row's viewerLogin and page inference", () => {
      const helpers = createHelpers({
        getCurrentViewerLogin: () => "alice",
        inferViewerLoginFromPage: () => "carol",
      });
      expect(helpers.getEffectiveViewerLogin({ viewerLogin: "bob" })).toBe("alice");
    });
  });

  describe("missing dependencies", () => {
    test("given no dependencies are injected, when getting the effective viewer login, then safe fallbacks are used without throwing", () => {
      const helpers = createPrActorIdentityRenderHelpers();
      expect(helpers.getEffectiveViewerLogin({ viewerLogin: "Dave" })).toBe("dave");
    });
  });
});
