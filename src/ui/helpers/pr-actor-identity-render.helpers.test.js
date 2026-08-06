/** @jest-environment jsdom */

const {
  createPrActorIdentityRenderHelpers,
} = require("./pr-actor-identity-render.helpers.js");

describe("pr actor identity render helpers", () => {
  const createHelpers = (overrides = {}) =>
    createPrActorIdentityRenderHelpers({
      normalizeActorLogin: (value) => String(value || "").trim(),
      getCurrentViewerLogin: () => "viewer",
      inferViewerLoginFromPage: () => "",
      resolveActorDisplayName: (login, actorsMap, fallbackName) =>
        String(actorsMap?.[login] || fallbackName || login || "").trim(),
      formatIsoDatetime: (value) => `formatted:${value}`,
      documentRef: document,
      ...overrides,
    });

  test("given viewer and author logins, when getting actor identity state, then viewer and PR author flags are computed", () => {
    const helpers = createHelpers();
    const identity = helpers.getActorIdentityState("author", {
      authorLogin: "author",
    });

    expect(identity).toEqual({
      normalizedLogin: "author",
      isViewer: false,
      isPrAuthor: true,
    });
  });

  test("given actor login metadata, when creating actor identity element, then classes and title include identity tags", () => {
    const helpers = createHelpers({
      getCurrentViewerLogin: () => "alice",
    });
    const actor = helpers.createActorIdentityElement({
      row: { authorLogin: "alice" },
      login: "alice",
      actorsMap: { alice: "Alice" },
      className: "custom-class",
    });

    expect(actor).not.toBeNull();
    expect(actor.textContent).toBe("Alice");
    expect(actor.className).toContain("actor-identity");
    expect(actor.className).toContain("custom-class");
    expect(actor.className).toContain("actor-identity-viewer");
    expect(actor.className).toContain("actor-identity-pr-author");
    expect(actor.title).toBe("Current user • PR author");
  });

  test("given shared style builders are injected, when creating actor identity element, then injected class and title builders are applied", () => {
    const buildActorIdentityClassName = jest.fn(() => "actor-identity shared-identity");
    const buildActorIdentityTitle = jest.fn(() => "Shared identity");
    const helpers = createHelpers({
      getCurrentViewerLogin: () => "alice",
      buildActorIdentityClassName,
      buildActorIdentityTitle,
    });

    const actor = helpers.createActorIdentityElement({
      row: { authorLogin: "alice" },
      login: "alice",
      actorsMap: { alice: "Alice" },
      className: "author-cell-name",
    });

    expect(actor.className).toBe("actor-identity shared-identity");
    expect(actor.title).toBe("Shared identity");
    expect(buildActorIdentityClassName).toHaveBeenCalledWith({
      identityState: {
        normalizedLogin: "alice",
        isViewer: true,
        isPrAuthor: true,
      },
      className: "author-cell-name",
    });
    expect(buildActorIdentityTitle).toHaveBeenCalledWith({
      normalizedLogin: "alice",
      isViewer: true,
      isPrAuthor: true,
    });
  });

  test("given prefix and suffix, when creating actor identity fragment, then fragment preserves surrounding text", () => {
    const helpers = createHelpers();
    const fragment = helpers.createActorIdentityFragment({
      login: "alice",
      actorsMap: { alice: "Alice" },
      prefix: "(",
      suffix: ")",
    });

    const host = document.createElement("div");
    host.appendChild(fragment);
    expect(host.textContent).toBe("(Alice)");
  });

  test("given inline content segments, when appending inline segment repeatedly, then separators appear only between valid segments", () => {
    const helpers = createHelpers();
    const host = document.createElement("span");
    const state = { first: true };

    helpers.appendInlineSegment(host, state, "One");
    helpers.appendInlineSegment(host, state, "");
    helpers.appendInlineSegment(host, state, "Two");

    expect(host.textContent).toBe("One | Two");
  });

  test("given actor list values, when creating actor list fragment, then actors are comma-separated and resolved", () => {
    const helpers = createHelpers();
    const fragment = helpers.createActorListFragment(
      [
        { login: "alice" },
        { login: "bob", fallbackName: "Bob Fallback" },
      ],
      {},
      { alice: "Alice", bob: "Bob" },
    );

    const host = document.createElement("div");
    host.appendChild(fragment);
    expect(host.textContent).toBe("Alice, Bob");
  });

  test("given timestamp and actor inputs, when appending timestamp and actor, then formatted timestamp and actor identity are appended", () => {
    const helpers = createHelpers();
    const host = document.createElement("span");

    helpers.appendTimestampAndActor({
      container: host,
      timestamp: "2026-01-01T00:00:00Z",
      login: "alice",
      actorsMap: { alice: "Alice" },
      suffix: " updated",
    });

    expect(host.textContent).toBe("formatted:2026-01-01T00:00:00Z | Alice updated");
  });
});
