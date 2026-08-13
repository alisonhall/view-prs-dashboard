/** @jest-environment jsdom */

const {
  createPrActorNameCacheHelpers,
} = require("../helpers/pr-actor-name-cache.helpers.js");

const mountElements = () => {
  document.body.innerHTML = [
    '<p id="actor-name-cache-status"></p>',
    '<div id="actor-name-cache-rows"></div>',
    '<p id="actor-login-aliases-status"></p>',
    '<div id="actor-login-aliases-rows"></div>',
  ].join("");
};

describe("pr actor name cache helpers", () => {
  test("given normalized entries, when renderActorNameCacheRows runs, then rows are rendered in sorted order", () => {
    mountElements();
    const helper = createPrActorNameCacheHelpers({
      fetch: jest.fn(),
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    helper.renderActorNameCacheRows({
      zeta: "Zeta User",
      alpha: "Alpha User",
    });

    const rowsHost = document.getElementById("actor-name-cache-rows");
    expect(rowsHost.children.length).toBe(2);
    expect(rowsHost.children[0].querySelector(".actor-name-cache-id")?.value).toBe("alpha");
    expect(rowsHost.children[0].querySelector(".actor-name-cache-name")?.value).toBe("Alpha User");
    expect(rowsHost.children[1].querySelector(".actor-name-cache-id")?.value).toBe("zeta");
  });

  test("given a row set with duplicates, when getActorNameCachePayloadFromRows runs, then validation fails", () => {
    mountElements();
    const rowsHost = document.getElementById("actor-name-cache-rows");
    rowsHost.innerHTML = [
      '<div class="actor-name-cache-row"><input class="actor-name-cache-id" value="user-a"><input class="actor-name-cache-name" value="User A"></div>',
      '<div class="actor-name-cache-row"><input class="actor-name-cache-id" value="user-a"><input class="actor-name-cache-name" value="User Duplicate"></div>',
    ].join("");

    const helper = createPrActorNameCacheHelpers({
      fetch: jest.fn(),
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    const result = helper.getActorNameCachePayloadFromRows();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Duplicate ID detected");
  });

  test("given endpoint responses succeed, when load and save run, then status and writes are updated", async () => {
    mountElements();
    const fetch = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { user1: "User One" } }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { alias1: "canonical1" } }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { user1: "User One" } }),
      }));

    const helper = createPrActorNameCacheHelpers({
      fetch,
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    await helper.loadActorNameCache();
    const statusEl = document.getElementById("actor-name-cache-status");
    expect(statusEl.textContent).toContain("Loaded 1 mapping");

    const payloadResult = helper.getActorNameCachePayloadFromRows();
    expect(payloadResult.ok).toBe(true);

    await helper.saveActorNameCache();

    expect(fetch).toHaveBeenNthCalledWith(1, "/view-prs/actor-name-cache");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/view-prs/actor-login-aliases",
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/view-prs/actor-name-cache",
      expect.objectContaining({
        method: "PUT",
      }),
    );
    expect(statusEl.textContent).toContain("Saved 1 mapping");
  });

  test("given alias rows with duplicates, when getActorLoginAliasesPayloadFromRows runs, then validation fails", () => {
    mountElements();
    const rowsHost = document.getElementById("actor-login-aliases-rows");
    rowsHost.innerHTML = [
      '<div class="actor-login-alias-row"><input class="actor-login-alias-id" value="alias-a"><input class="actor-login-alias-canonical" value="canonical-a"></div>',
      '<div class="actor-login-alias-row"><input class="actor-login-alias-id" value="alias-a"><input class="actor-login-alias-canonical" value="canonical-b"></div>',
    ].join("");

    const helper = createPrActorNameCacheHelpers({
      fetch: jest.fn(),
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    const result = helper.getActorLoginAliasesPayloadFromRows();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Duplicate alias login detected");
  });

  test("given an incomplete alias row, when getActorLoginAliasesPayloadFromRows runs, then validation fails", () => {
    mountElements();
    const rowsHost = document.getElementById("actor-login-aliases-rows");
    rowsHost.innerHTML = [
      '<div class="actor-login-alias-row"><input class="actor-login-alias-id" value="alias-a"><input class="actor-login-alias-canonical" value=""></div>',
    ].join("");

    const helper = createPrActorNameCacheHelpers({
      fetch: jest.fn(),
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    const result = helper.getActorLoginAliasesPayloadFromRows();
    expect(result.ok).toBe(false);
    expect(result.error).toContain(
      "Each non-empty alias row must include both an alias login and a canonical login",
    );
  });

  test("given an alias row where alias and canonical logins match, when getActorLoginAliasesPayloadFromRows runs, then validation fails", () => {
    mountElements();
    const rowsHost = document.getElementById("actor-login-aliases-rows");
    rowsHost.innerHTML = [
      '<div class="actor-login-alias-row"><input class="actor-login-alias-id" value="same-login"><input class="actor-login-alias-canonical" value="same-login"></div>',
    ].join("");

    const helper = createPrActorNameCacheHelpers({
      fetch: jest.fn(),
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    const result = helper.getActorLoginAliasesPayloadFromRows();
    expect(result.ok).toBe(false);
    expect(result.error).toContain(
      "Alias login and canonical login must differ",
    );
  });

  test("given alias endpoint responses succeed, when alias rows are loaded and saved, then alias status and writes are updated", async () => {
    mountElements();
    const fetch = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { user1: "User One" } }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { alias1: "canonical1" } }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({ ok: true, entries: { alias1: "canonical1" } }),
      }));

    const helper = createPrActorNameCacheHelpers({
      fetch,
      getOptionalElementById: (id) => {
        return document.getElementById(id);
      },
    });

    await helper.loadActorNameCache();
    const aliasStatusEl = document.getElementById("actor-login-aliases-status");
    expect(aliasStatusEl.textContent).toContain("Loaded 1 alias mapping");

    const aliasPayloadResult = helper.getActorLoginAliasesPayloadFromRows();
    expect(aliasPayloadResult.ok).toBe(true);

    await helper.saveActorLoginAliases();

    expect(fetch).toHaveBeenNthCalledWith(2, "/view-prs/actor-login-aliases");
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/view-prs/actor-login-aliases",
      expect.objectContaining({
        method: "PUT",
      }),
    );
    expect(aliasStatusEl.textContent).toContain("Saved 1 alias mapping");
  });
});
