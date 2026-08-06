/** @jest-environment jsdom */

const {
  createPrRenderViewerFilterSetupHelpers,
} = require("./pr-render-viewer-filter-setup.helpers.js");

describe("pr render viewer/filter setup helpers", () => {
  test("given payload and entries, when deriving viewer/filter setup, then viewer context and filter options are both coordinated", () => {
    const deriveViewerContext = jest.fn(() => ({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
    }));
    const populateFilterOptions = jest.fn();
    const commitViewerContext = jest.fn();
    const { deriveViewerFilterSetup } = createPrRenderViewerFilterSetupHelpers({
      deriveViewerContext,
      commitViewerContext,
      populateFilterOptions,
    });
    const payload = {
      actorsMap: { me: { displayName: "Me" } },
    };

    const result = deriveViewerFilterSetup({
      payload,
      allEntries: [{ id: 1 }],
      repoFilter: "org/repo",
    });

    expect(deriveViewerContext).toHaveBeenCalledWith({
      payload,
      allEntries: [{ id: 1 }],
    });
    expect(populateFilterOptions).toHaveBeenCalledWith({
      entries: [{ id: 1 }],
      repoFilter: "org/repo",
      actorsMap: { me: { displayName: "Me" } },
    });
    expect(commitViewerContext).toHaveBeenCalledWith({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
    });
    expect(
      commitViewerContext.mock.invocationCallOrder[0],
    ).toBeLessThan(populateFilterOptions.mock.invocationCallOrder[0]);
    expect(result).toEqual({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
    });
  });

  test("given payload without actors map, when deriving viewer/filter setup, then empty actors map fallback is passed", () => {
    const populateFilterOptions = jest.fn();
    const { deriveViewerFilterSetup } = createPrRenderViewerFilterSetupHelpers({
      deriveViewerContext: () => ({
        currentActorLoginAliases: {},
        currentViewerLogin: "",
      }),
      commitViewerContext: () => {},
      populateFilterOptions,
    });

    deriveViewerFilterSetup({
      payload: {},
      allEntries: [],
      repoFilter: "",
    });

    expect(populateFilterOptions).toHaveBeenCalledWith({
      entries: [],
      repoFilter: "",
      actorsMap: {},
    });
  });

  test("given missing dependencies, when deriving viewer/filter setup, then safe defaults are returned", () => {
    const { deriveViewerFilterSetup } = createPrRenderViewerFilterSetupHelpers();

    expect(
      deriveViewerFilterSetup({
        payload: null,
        allEntries: null,
        repoFilter: null,
      }),
    ).toEqual({
      currentActorLoginAliases: {},
      currentViewerLogin: "",
    });
  });
});
