/** @jest-environment jsdom */

const {
  createPrRenderViewerFilterSetupHelpers,
} = require("./pr-render-viewer-filter-setup.helpers.js");

describe("pr render viewer/filter setup helpers", () => {
  test("given payload and entries, when deriving viewer/filter setup, then viewer context is derived and committed", () => {
    const deriveViewerContext = jest.fn(() => ({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
    }));
    const commitViewerContext = jest.fn();
    const { deriveViewerFilterSetup } = createPrRenderViewerFilterSetupHelpers({
      deriveViewerContext,
      commitViewerContext,
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
    expect(commitViewerContext).toHaveBeenCalledWith({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
    });
    expect(result).toEqual({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "me-login",
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
