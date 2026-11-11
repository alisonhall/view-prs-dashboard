const { createPrUiOptionPersistenceHelpers, serializeOverridesUpdate } = require("./pr-ui-option-persistence.helpers.ts");

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
    expect(FILTER_STATE_FIELD_MAP["only-needs-attention"]).toBe("onlyNeedsAttention");
    expect(FILTER_STATE_FIELD_MAP["only-open-conversations-with-me"]).toBe("onlyOpenConversationsWithMe");
    expect(FILTER_STATE_FIELD_MAP["only-waiting-on-me"]).toBe("onlyWaitingOnMe");
    expect(FILTER_STATE_FIELD_MAP["only-threads-to-check"]).toBe("onlyThreadsToCheck");
    expect(FILTER_STATE_FIELD_MAP["scope-mode"]).toBeUndefined();
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

    await expect(writeUiSessionOverrides({ repo: "a/b" })).resolves.toBe(false);
  });

  test("writeUiSessionOverrides resolves to whether they're saved: true when written or unchanged, false when refused", async () => {
    let ok = true;
    const fetchFn = jest.fn(async () => ({ ok }));
    const { writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await expect(writeUiSessionOverrides({ repo: "a/b" })).resolves.toBe(true);
    ok = false;
    await expect(writeUiSessionOverrides({ repo: "a/b" })).resolves.toBe(false);
    await expect(writeUiSessionOverrides({ repo: "a/b" }, { unchangedFrom: { repo: "a/b" } })).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("updateUiSessionOverride sets one key and keeps the others, or removes it for undefined", async () => {
    let saved = { repo: "a/b", theme: "dark" };
    const fetchFn = jest.fn(async (_url, init) => {
      if (init?.method === "PUT") {
        saved = JSON.parse(init.body);
        return { ok: true };
      }
      return { ok: true, json: async () => ({ overrides: saved }) };
    });
    const { updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await updateUiSessionOverride("prSections", { closed: { hidden: true } });
    expect(saved).toEqual({ repo: "a/b", theme: "dark", prSections: { closed: { hidden: true } } });

    await updateUiSessionOverride("theme", undefined);
    expect(saved).toEqual({ repo: "a/b", prSections: { closed: { hidden: true } } });
  });

  test("readUiSessionOverridesOrNull tells a failed read from nothing saved", async () => {
    const failing = createPrUiOptionPersistenceHelpers({ fetch: jest.fn(async () => ({ ok: false })) });
    await expect(failing.readUiSessionOverridesOrNull()).resolves.toBeNull();
    const throwing = createPrUiOptionPersistenceHelpers({
      fetch: jest.fn(async () => {
        throw new Error("network down");
      }),
    });
    await expect(throwing.readUiSessionOverridesOrNull()).resolves.toBeNull();
    const empty = createPrUiOptionPersistenceHelpers({ fetch: jest.fn(async () => ({ ok: true, json: async () => ({}) })) });
    await expect(empty.readUiSessionOverridesOrNull()).resolves.toEqual({});
  });

  test("updateUiSessionOverride writes nothing when the saved overrides can't be read", async () => {
    const fetchFn = jest.fn(async () => ({ ok: false }));
    const { updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await updateUiSessionOverride("theme", "dark");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  test("writeUiSessionOverrides writes nothing when nothing differs from what they were built from", async () => {
    // Every save writes back all the overrides, so one that changes nothing
    // (each page load's restore triggers one) could only put back a value
    // another tab just changed.
    const fetchFn = jest.fn(async () => ({ ok: true }));
    const { writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });
    const read = { theme: "dark", label: ["bug"], prSections: { flagged: { hidden: true }, open: { open: true } } };

    // The same, in another key order, and with an empty list dropped either way.
    await writeUiSessionOverrides(
      { prSections: { open: { open: true }, flagged: { hidden: true } }, label: ["bug"], theme: "dark", author: [] },
      { unchangedFrom: read },
    );
    expect(fetchFn).not.toHaveBeenCalled();

    await writeUiSessionOverrides({ ...read, theme: "light" }, { unchangedFrom: read });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).theme).toBe("light");

    // Without unchangedFrom, as before: always written.
    await writeUiSessionOverrides(read);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("updateUiSessionOverride writes nothing when the value is already saved", async () => {
    const fetchFn = jest.fn(async (_url, init) =>
      init?.method === "PUT" ? { ok: true } : { ok: true, json: async () => ({ overrides: { theme: "dark" } }) },
    );
    const { updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await updateUiSessionOverride("theme", "dark");
    await updateUiSessionOverride("prSections", undefined);

    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });
});

describe("serializeOverridesUpdate", () => {
  test("runs updates one at a time, so two at once each build on the other's write", async () => {
    // A server whose reads and writes take a turn of the event loop.
    let stored = { repo: "acme/api" };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const fetchFn = jest.fn(async (_url, init) => {
      await tick();
      if (init?.method === "PUT") stored = JSON.parse(init.body);
      return { ok: true, json: async () => ({ overrides: stored }) };
    });
    const { updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({ fetch: fetchFn });

    await Promise.all([updateUiSessionOverride("a", 1), updateUiSessionOverride("b", 2)]);
    expect(stored).toEqual({ repo: "acme/api", a: 1, b: 2 });
  });

  test("a failed update doesn't stop the next", async () => {
    const order = [];
    const failing = serializeOverridesUpdate(async () => {
      order.push("first");
      throw new Error("boom");
    });
    const next = serializeOverridesUpdate(async () => order.push("second"));
    await expect(failing).rejects.toThrow("boom");
    await next;
    expect(order).toEqual(["first", "second"]);
  });
});
