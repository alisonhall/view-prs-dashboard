/** @jest-environment jsdom */

const {
  createPrViewerContextHelpers,
} = require("./pr-viewer-context.helpers.ts");

describe("pr viewer context helpers", () => {
  test("given a payload viewer login and people, when deriving the viewer context, then the people are indexed and the login lower-cased", () => {
    const inferViewerLoginFromPage = jest.fn(() => "fallback-login");
    const { deriveViewerContext } = createPrViewerContextHelpers({ inferViewerLoginFromPage });

    const result = deriveViewerContext({
      payload: {
        actors: [{ id: "actor:viewer", name: "Vee", logins: ["Viewer.Login", "viewer-alt"] }],
        viewerLogin: " Viewer.Login ",
      },
      allEntries: [{ data: { viewerLogin: "row-login" } }],
    });

    expect(result.currentViewerLogin).toBe("viewer.login");
    expect(result.currentActorIndex.idByLoginKey.get("viewer.login")).toBe("actor:viewer");
    expect(result.currentActorIndex.idByLoginKey.get("viewer-alt")).toBe("actor:viewer");
    expect(result.currentActorIndex.loginsById.get("actor:viewer")).toEqual(["Viewer.Login", "viewer-alt"]);
    expect(inferViewerLoginFromPage).not.toHaveBeenCalled();
  });

  test("given missing payload viewer login, when deriving viewer context, then viewer login falls back to row viewer login", () => {
    const { deriveViewerContext } = createPrViewerContextHelpers({ inferViewerLoginFromPage: () => "page-login" });

    const result = deriveViewerContext({
      payload: {},
      allEntries: [{ data: {} }, { data: { viewerLogin: "row-login" } }],
    });

    expect(result.currentViewerLogin).toBe("row-login");
  });

  test("given missing payload and row viewer logins, when deriving viewer context, then viewer login falls back to page inference", () => {
    const { deriveViewerContext } = createPrViewerContextHelpers({ inferViewerLoginFromPage: () => "Page-Login" });

    const result = deriveViewerContext({ payload: null, allEntries: [] });

    expect(result.currentViewerLogin).toBe("page-login");
    expect(result.currentActorIndex.idByLoginKey.size).toBe(0);
  });
});
