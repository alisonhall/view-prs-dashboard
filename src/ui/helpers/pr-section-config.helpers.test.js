/** @jest-environment jsdom */

const {
  createPrSectionConfigHelpers,
} = require("./pr-section-config.helpers.js");

describe("pr section config helpers", () => {
  test("given grouped rows and open-state resolver, when building section configs, then four ordered section configs are returned", () => {
    const resolvePrSectionOpenState = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
      resolvePrSectionOpenState,
    });

    const configs = buildPrSectionConfigs({
      grouped: {
        open: [{ data: { number: 1, baseline: "2026-01-01" } }],
        draft: [{ data: { number: 2, baseline: "2026-01-02" } }],
        closed: [{ data: { number: 3, closedAt: "2026-01-03" } }],
        merged: [{ data: { number: 4, mergedAt: "2026-01-04" } }],
      },
      prSectionOpenState: new Map(),
      lastCheckedAt: "2026-01-10T00:00:00.000Z",
      actorsMapFromPayload: { alice: { login: "alice" } },
    });

    expect(configs).toHaveLength(4);
    expect(configs.map((config) => config.sectionKey)).toEqual([
      "open",
      "draft",
      "closed",
      "merged",
    ]);
    expect(configs[0].title).toBe("Open PRs");
    expect(configs[3].title).toBe("Latest Merged PRs");
    expect(configs[2].dateHeader).toBe("CLOSED AT");
    expect(configs[0].lastCheckedAt).toBe("2026-01-10T00:00:00.000Z");
    expect(configs[0].actorsMapFromPayload).toEqual({
      alice: { login: "alice" },
    });
    expect(resolvePrSectionOpenState).toHaveBeenNthCalledWith(
      1,
      expect.any(Map),
      "open",
      false,
    );
    expect(resolvePrSectionOpenState).toHaveBeenNthCalledWith(
      2,
      expect.any(Map),
      "draft",
      false,
    );
    expect(resolvePrSectionOpenState).toHaveBeenNthCalledWith(
      3,
      expect.any(Map),
      "closed",
      false,
    );
    expect(resolvePrSectionOpenState).toHaveBeenNthCalledWith(
      4,
      expect.any(Map),
      "merged",
      false,
    );
  });

  test("given missing grouped keys, when building section configs, then each section uses empty rows fallback", () => {
    const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
      resolvePrSectionOpenState: () => false,
    });

    const configs = buildPrSectionConfigs({ grouped: {} });

    expect(configs).toHaveLength(4);
    expect(configs.every((config) => Array.isArray(config.rows))).toBe(true);
    expect(configs.every((config) => config.rows.length === 0)).toBe(true);
  });

  test("given each section config, when resolving date for a row, then the section-specific date field is returned", () => {
    const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
      resolvePrSectionOpenState: () => true,
    });

    const configs = buildPrSectionConfigs({
      grouped: { open: [], draft: [], closed: [], merged: [] },
    });

    const [openConfig, draftConfig, closedConfig, mergedConfig] = configs;
    expect(openConfig.dateResolver({ baseline: "b" })).toBe("b");
    expect(draftConfig.dateResolver({ baseline: "d" })).toBe("d");
    expect(closedConfig.dateResolver({ baseline: "c" })).toBe("c");
    expect(mergedConfig.dateResolver({ baseline: "m" })).toBe("m");
  });

  describe("smart groups", () => {
    test("given smart groups provided, when building section configs, then smart group sections are prepended", () => {
      const resolvePrSectionOpenState = jest.fn((_, __, defaultOpen) => defaultOpen);
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState,
      });

      const smartGroups = {
        flagged: {
          title: "Flagged",
          icon: "🚩",
          rows: [{ prNumber: "1", data: { number: "1" } }],
          defaultOpen: false,
        },
        "needs-attention": {
          title: "Needs Attention",
          icon: "⚠️",
          rows: [{ prNumber: "2", data: { number: "2" } }],
          defaultOpen: true,
        },
      };

      const configs = buildPrSectionConfigs({
        grouped: { open: [], draft: [], closed: [], merged: [] },
        smartGroups,
        prSectionOpenState: new Map(),
      });

      expect(configs).toHaveLength(6); // 2 smart groups + 4 lifecycle
      expect(configs[0].sectionKey).toBe("flagged");
      expect(configs[0].title).toBe("Flagged");
      expect(configs[0].icon).toBe("🚩");
      expect(configs[0].isSmartGroup).toBe(true);
      expect(configs[0].rows).toHaveLength(1);

      expect(configs[1].sectionKey).toBe("needs-attention");
      expect(configs[1].title).toBe("Needs Attention");
      expect(configs[1].icon).toBe("⚠️");
      expect(configs[1].isSmartGroup).toBe(true);

      // Lifecycle sections should follow
      expect(configs[2].sectionKey).toBe("open");
      expect(configs[2].isSmartGroup).toBe(false);
      expect(configs[5].sectionKey).toBe("merged");
      expect(configs[5].isSmartGroup).toBe(false);
    });

    test("given no smart groups provided, when building section configs, then only lifecycle sections returned", () => {
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState: () => true,
      });

      const configs = buildPrSectionConfigs({
        grouped: { open: [], draft: [], closed: [], merged: [] },
        smartGroups: null,
      });

      expect(configs).toHaveLength(4);
      expect(configs.every((c) => c.isSmartGroup === false)).toBe(true);
    });

    test("given smart group with defaultOpen false, when building configs, then respects defaultOpen setting", () => {
      const resolvePrSectionOpenState = jest.fn((_, __, defaultOpen) => defaultOpen);
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState,
      });

      const smartGroups = {
        test: {
          title: "Test",
          icon: "🧪",
          rows: [],
          defaultOpen: false,
        },
      };

      const configs = buildPrSectionConfigs({
        grouped: { open: [], draft: [], closed: [], merged: [] },
        smartGroups,
        prSectionOpenState: new Map(),
      });

      expect(resolvePrSectionOpenState).toHaveBeenCalledWith(
        expect.any(Map),
        "test",
        false,
      );
      expect(configs[0].isOpen).toBe(false);
    });

    test("given smart group with invalid rows, when building configs, then uses empty array fallback", () => {
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState: () => true,
      });

      const smartGroups = {
        test: {
          title: "Test",
          rows: null, // Invalid
        },
      };

      const configs = buildPrSectionConfigs({
        grouped: { open: [], draft: [], closed: [], merged: [] },
        smartGroups,
      });

      expect(configs[0].rows).toEqual([]);
    });

    test("given smart group sections, when checking structure, then includes all required fields", () => {
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState: () => true,
      });

      const smartGroups = {
        flagged: {
          title: "Flagged",
          icon: "🚩",
          rows: [{ baseline: "2026-01-01" }],
          defaultOpen: true,
        },
      };

      const configs = buildPrSectionConfigs({
        grouped: { open: [], draft: [], closed: [], merged: [] },
        smartGroups,
        lastCheckedAt: "2026-01-10T00:00:00Z",
        actorsMapFromPayload: { bob: { login: "bob" } },
      });

      expect(configs[0]).toMatchObject({
        title: "Flagged",
        icon: "🚩",
        rows: expect.any(Array),
        dateHeader: "LAST ACTIVITY",
        sectionKey: "flagged",
        lastCheckedAt: "2026-01-10T00:00:00Z",
        actorsMapFromPayload: { bob: { login: "bob" } },
        isOpen: true,
        isSmartGroup: true,
      });
      expect(typeof configs[0].dateResolver).toBe("function");
      expect(configs[0].dateResolver({ baseline: "test" })).toBe("test");
    });

    // Regression test: a PR that is a member of a smart group must still
    // appear in its lifecycle section's rows - the "non-exclusive
    // membership" design documented in README.md's "Smart group features"
    // ("A single PR can appear in multiple smart groups AND its lifecycle
    // section"). A prior fix filtered smart-group members out of the
    // lifecycle section's rows to avoid duplicate <tr>s, which silently
    // broke this and made lifecycle sections (e.g. "Open PRs") undercount
    // and under-render relative to smart groups like "Open PRs I'm
    // Involved In".
    test("given a PR that is also a smart group member, when building lifecycle section configs, then the lifecycle section's rows still include it (not deduplicated)", () => {
      const { buildPrSectionConfigs } = createPrSectionConfigHelpers({
        resolvePrSectionOpenState: () => false,
      });

      const sharedEntry = { prNumber: "1", data: { number: "1" } };
      const otherEntry = { prNumber: "2", data: { number: "2" } };

      const smartGroups = {
        "interacted": {
          title: "Open PRs I'm Involved In",
          icon: "💬",
          rows: [sharedEntry],
          defaultOpen: false,
        },
      };

      const configs = buildPrSectionConfigs({
        grouped: { open: [sharedEntry, otherEntry], draft: [], closed: [], merged: [] },
        smartGroups,
      });

      const openConfig = configs.find((config) => config.sectionKey === "open");
      expect(openConfig.rows).toHaveLength(2);
      expect(openConfig.rows.map((entry) => entry.prNumber).sort()).toEqual(["1", "2"]);
      expect(openConfig.renderRows).toBeUndefined();
    });
  });
});
