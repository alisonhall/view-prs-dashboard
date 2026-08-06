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
      true,
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
      true,
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
    expect(closedConfig.dateResolver({ closedAt: "c" })).toBe("c");
    expect(mergedConfig.dateResolver({ mergedAt: "m" })).toBe("m");
  });
});
