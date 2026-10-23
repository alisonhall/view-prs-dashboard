/** @jest-environment jsdom */

const {
  createPrAutoRenderStateHelpers,
} = require("./pr-auto-render-state.helpers.ts");

describe("auto render state helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrAutoRenderStateHelpers({
      getUnsavedNotesPrNumbers: () => ["7"],
      getBlockingPrNumbers: () => ["12", "15"],
      getBlockingAuthorInsightsLogins: () => ["alice"],
      formatBlockingPrNumbersLabel: (prNumbers) =>
        Array.isArray(prNumbers) && prNumbers.length > 0
          ? `Blocking PRs: ${prNumbers.join(", ")}`
          : "",
      ...overrides,
    });

  test("given unsaved state providers, when collecting auto render blocking state, then aggregated fields and labels are returned", () => {
    const { getAutoRenderBlockingState } = createHelpers();

    expect(getAutoRenderBlockingState()).toEqual({
      dirtyFieldCount: 0,
      unsavedNotesCount: 1,
      blockingPrNumbers: ["12", "15"],
      blockingAuthorInsightsLogins: ["alice"],
      blockingPrLabel: "Blocking PRs: 12, 15",
    });
  });

  test("given blocking state with unsaved values, when computing dirty status, then dirty flag is true", () => {
    const { computeHasDirtyPrSectionsFields } = createHelpers();

    expect(
      computeHasDirtyPrSectionsFields({
        dirtyFieldCount: 0,
        unsavedNotesCount: 0,
        blockingAuthorInsightsLogins: ["alice"],
      }),
    ).toBe(true);

    expect(
      computeHasDirtyPrSectionsFields({
        dirtyFieldCount: 1,
        unsavedNotesCount: 0,
        blockingAuthorInsightsLogins: [],
      }),
    ).toBe(true);
  });

  test("given clean state, when computing dirty status, then dirty flag is false", () => {
    const { computeHasDirtyPrSectionsFields } = createHelpers();

    expect(
      computeHasDirtyPrSectionsFields({
        dirtyFieldCount: 0,
        unsavedNotesCount: 0,
        blockingAuthorInsightsLogins: [],
      }),
    ).toBe(false);
  });
});
