const { createPrUiOptionPersistenceHelpers } = require("./pr-ui-option-persistence.helpers.js");

describe("pr-ui-option-persistence helpers", () => {
  test("getUiOptionDefaults returns the full default shape", () => {
    const { getUiOptionDefaults } = createPrUiOptionPersistenceHelpers({ fetch: jest.fn() });
    const defaults = getUiOptionDefaults();

    expect(defaults.repo).toBe("");
    expect(defaults["open-mode"]).toBe("none");
    expect(defaults["show-reason"]).toBe(true);
    expect(defaults.author).toEqual([]);
  });

  test("FILTER_STATE_FIELD_MAP maps every text/checkbox field id to its Context key", () => {
    const { FILTER_STATE_FIELD_MAP } = createPrUiOptionPersistenceHelpers({ fetch: jest.fn() });

    expect(FILTER_STATE_FIELD_MAP.repo).toBe("repo");
    expect(FILTER_STATE_FIELD_MAP["scope-mode"]).toBe("scopeMode");
    expect(FILTER_STATE_FIELD_MAP["change-filter-ignore-commit-patterns"]).toBe(
      "changeFilterIgnoreCommitPatterns",
    );
  });

  test("readUiSessionOverrides returns the parsed overrides object on success", async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ overrides: { repo: "a/b" } }),
    }));
    const { readUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await expect(readUiSessionOverrides()).resolves.toEqual({ repo: "a/b" });
  });

  test("readUiSessionOverrides returns {} when the response is not ok", async () => {
    const fetchFn = jest.fn(async () => ({ ok: false }));
    const { readUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await expect(readUiSessionOverrides()).resolves.toEqual({});
  });

  test("readUiSessionOverrides returns {} when fetch throws", async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error("network down");
    });
    const { readUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await expect(readUiSessionOverrides()).resolves.toEqual({});
  });

  test("writeUiSessionOverrides PUTs only defined scalars and non-empty arrays", async () => {
    const fetchFn = jest.fn(async () => ({ ok: true }));
    const { writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await writeUiSessionOverrides({ repo: "a/b", author: [], assigned: ["x"], quiet: undefined });

    expect(fetchFn).toHaveBeenCalledWith(
      "/view-prs/user-defaults",
      expect.objectContaining({ method: "PUT" }),
    );
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ repo: "a/b", assigned: ["x"] });
  });

  test("writeUiSessionOverrides preserves an explicitly-listed empty array key", async () => {
    const fetchFn = jest.fn(async () => ({ ok: true }));
    const { writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await writeUiSessionOverrides({ author: [] }, { preserveEmptyArrayKeys: ["author"] });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ author: [] });
  });

  test("writeUiSessionOverrides swallows a thrown fetch error", async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error("network down");
    });
    const { writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await expect(writeUiSessionOverrides({ repo: "a/b" })).resolves.toBeUndefined();
  });
});
