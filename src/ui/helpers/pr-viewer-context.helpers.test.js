/** @jest-environment jsdom */

const {
  createPrViewerContextHelpers,
} = require("./pr-viewer-context.helpers.js");

describe("pr viewer context helpers", () => {
  test("given payload viewer login and aliases, when deriving viewer context, then payload viewer login and aliases are normalized", () => {
    const normalizeActorLoginAliases = jest.fn((aliases) => aliases);
    const normalizeActorLogin = jest.fn((login) => String(login).toLowerCase());
    const inferViewerLoginFromPage = jest.fn(() => "fallback-login");
    const { deriveViewerContext } = createPrViewerContextHelpers({
      normalizeActorLoginAliases,
      normalizeActorLogin,
      inferViewerLoginFromPage,
    });

    const result = deriveViewerContext({
      payload: {
        actorLoginAliases: { me: ["me-login"] },
        viewerLogin: "Viewer.Login",
      },
      allEntries: [{ data: { viewerLogin: "row-login" } }],
    });

    expect(result).toEqual({
      currentActorLoginAliases: { me: ["me-login"] },
      currentViewerLogin: "viewer.login",
    });
    expect(normalizeActorLoginAliases).toHaveBeenCalledWith({
      me: ["me-login"],
    });
    expect(normalizeActorLogin).toHaveBeenCalledWith("Viewer.Login");
    expect(inferViewerLoginFromPage).not.toHaveBeenCalled();
  });

  test("given missing payload viewer login, when deriving viewer context, then viewer login falls back to row viewer login", () => {
    const { deriveViewerContext } = createPrViewerContextHelpers({
      normalizeActorLoginAliases: (aliases) => aliases,
      normalizeActorLogin: (login) => String(login || ""),
      inferViewerLoginFromPage: () => "page-login",
    });

    const result = deriveViewerContext({
      payload: {
        actorLoginAliases: {},
      },
      allEntries: [
        { data: {} },
        { data: { viewerLogin: "row-login" } },
      ],
    });

    expect(result.currentViewerLogin).toBe("row-login");
  });

  test("given missing payload and row viewer logins, when deriving viewer context, then viewer login falls back to page inference", () => {
    const { deriveViewerContext } = createPrViewerContextHelpers({
      normalizeActorLoginAliases: (aliases) => aliases,
      normalizeActorLogin: (login) => String(login || ""),
      inferViewerLoginFromPage: () => "page-login",
    });

    const result = deriveViewerContext({
      payload: {
        actorLoginAliases: {},
      },
      allEntries: [{ data: {} }],
    });

    expect(result.currentViewerLogin).toBe("page-login");
  });

  test("given missing entries array, when deriving viewer context, then defaults are used", () => {
    const { deriveViewerContext } = createPrViewerContextHelpers({
      normalizeActorLoginAliases: () => ({}),
      normalizeActorLogin: () => "",
      inferViewerLoginFromPage: () => "",
    });

    const result = deriveViewerContext({
      payload: {},
      allEntries: null,
    });

    expect(result).toEqual({
      currentActorLoginAliases: {},
      currentViewerLogin: "",
    });
  });
});
