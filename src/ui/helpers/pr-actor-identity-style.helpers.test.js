const {
  createPrActorIdentityStyleHelpers,
} = require("./pr-actor-identity-style.helpers.js");

describe("pr actor identity style helpers", () => {
  test("given viewer and author identity, when building class name, then viewer and author classes are included", () => {
    const { buildActorIdentityClassName } = createPrActorIdentityStyleHelpers();

    const className = buildActorIdentityClassName({
      identityState: { isViewer: true, isPrAuthor: true },
      className: "author-cell-name",
    });

    expect(className).toBe(
      "actor-identity author-cell-name actor-identity-viewer actor-identity-pr-author",
    );
  });

  test("given no identity flags, when building class name, then only base and custom classes are kept", () => {
    const { buildActorIdentityClassName } = createPrActorIdentityStyleHelpers();

    const className = buildActorIdentityClassName({
      identityState: { isViewer: false, isPrAuthor: false },
      className: "custom-class",
      baseClassName: "actor-token",
    });

    expect(className).toBe("actor-token custom-class");
  });

  test("given viewer and author identity, when building title, then shared identity title text is composed", () => {
    const { buildActorIdentityTitle } = createPrActorIdentityStyleHelpers();

    const title = buildActorIdentityTitle({ isViewer: true, isPrAuthor: true });

    expect(title).toBe("Current user • PR author");
  });
});
