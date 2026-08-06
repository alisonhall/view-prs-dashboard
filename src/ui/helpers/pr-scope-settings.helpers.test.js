/** @jest-environment jsdom */

const {
  createPrScopeSettingsHelpers,
} = require("./pr-scope-settings.helpers.js");

describe("pr scope settings helpers", () => {
  test("given csv pr number text and last-run scope, when deriving scope settings, then numeric pr numbers and inferred useLastRunScope are returned", () => {
    const { deriveScopeSettings } = createPrScopeSettingsHelpers({
      parseCsvTokens: (value) => String(value || "").split(","),
      normalizeSelectedScope: (value) => String(value || "").toLowerCase(),
    });

    const settings = deriveScopeSettings({
      filterPrNumbersRaw: "101, abc, 202,  ",
      scopeModeValue: "LAST-RUN",
    });

    expect(settings).toEqual({
      filterPrNumbers: ["101", "202"],
      selectedScope: "last-run",
      ignoreScopeForPrNumberFilter: true,
      useLastRunScope: true,
    });
  });

  test("given explicit options useLastRunScope false, when deriving scope settings, then override is respected", () => {
    const { deriveScopeSettings } = createPrScopeSettingsHelpers({
      parseCsvTokens: () => [],
      normalizeSelectedScope: () => "last-run",
    });

    const settings = deriveScopeSettings({
      filterPrNumbersRaw: "",
      scopeModeValue: "last-run",
      optionsUseLastRunScope: false,
    });

    expect(settings).toEqual({
      filterPrNumbers: [],
      selectedScope: "last-run",
      ignoreScopeForPrNumberFilter: false,
      useLastRunScope: false,
    });
  });

  test("given non-last-run scope and no override, when deriving scope settings, then useLastRunScope defaults to false", () => {
    const { deriveScopeSettings } = createPrScopeSettingsHelpers({
      parseCsvTokens: () => ["alpha"],
      normalizeSelectedScope: () => "needs-attention",
    });

    const settings = deriveScopeSettings({
      filterPrNumbersRaw: "alpha",
      scopeModeValue: "needs-attention",
    });

    expect(settings).toEqual({
      filterPrNumbers: [],
      selectedScope: "needs-attention",
      ignoreScopeForPrNumberFilter: false,
      useLastRunScope: false,
    });
  });
});
