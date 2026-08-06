const {
  createPrExportJsonBuildHelpers,
} = require("./pr-export-json-build.helpers.js");

describe("pr export json build helpers", () => {
  test("given no selected fields, when building visible export json, then an explicit selection error is thrown", () => {
    const { buildVisibleExportJson } = createPrExportJsonBuildHelpers({
      getLatestStoredPayload: () => ({ byPrNumber: {} }),
      getSelectedExportFieldPaths: () => ({ dataPaths: [], userStatePaths: [] }),
      getOptionalElementById: () => null,
      getVisiblePrNumbersFromSectionsHost: () => [],
      buildExportPayload: () => ({}),
      safeJsonStringify: JSON.stringify,
    });

    expect(() => buildVisibleExportJson()).toThrow(
      "Select at least one field before exporting.",
    );
  });

  test("given selected fields and visible rows, when building visible export json, then payload inputs and json output are returned", () => {
    const sectionsHost = { id: "pr-sections" };
    const buildExportPayload = jest.fn(({ payload, visiblePrNumbers }) => ({
      prCount: visiblePrNumbers.length,
      repo: payload?.lastRun?.repo || null,
      prs: visiblePrNumbers,
    }));

    const { buildVisibleExportJson } = createPrExportJsonBuildHelpers({
      getLatestStoredPayload: () => ({
        lastRun: { repo: "org/repo" },
        byPrNumber: { "101": {}, "202": {} },
      }),
      getSelectedExportFieldPaths: () => ({
        dataPaths: ["data.title"],
        userStatePaths: ["notesByPrNumber.otherNotes"],
      }),
      getOptionalElementById: (id) => (id === "pr-sections" ? sectionsHost : null),
      getVisiblePrNumbersFromSectionsHost: (node) =>
        node === sectionsHost ? ["101", "202"] : [],
      buildExportPayload,
      safeJsonStringify: (value) => JSON.stringify(value),
    });

    const result = buildVisibleExportJson();

    expect(buildExportPayload).toHaveBeenCalledWith({
      payload: {
        lastRun: { repo: "org/repo" },
        byPrNumber: { "101": {}, "202": {} },
      },
      visiblePrNumbers: ["101", "202"],
      selectedDataPaths: ["data.title"],
      selectedUserStatePaths: ["notesByPrNumber.otherNotes"],
    });
    expect(result).toEqual({
      exportPayload: {
        prCount: 2,
        repo: "org/repo",
        prs: ["101", "202"],
      },
      jsonText: '{"prCount":2,"repo":"org/repo","prs":["101","202"]}',
    });
  });
});
