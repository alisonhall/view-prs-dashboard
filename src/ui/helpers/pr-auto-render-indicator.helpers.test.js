/** @jest-environment jsdom */

const {
  createPrAutoRenderIndicatorHelpers,
} = require("./pr-auto-render-indicator.helpers.js");

describe("auto render indicator helpers", () => {
  const createHelpers = () =>
    createPrAutoRenderIndicatorHelpers({
      getAuthorInsightsDisplayName: (authorLogin) =>
        ({ alice: "Alice A", bob: "Bob B" }[
          String(authorLogin || "").trim().toLowerCase()
        ] || String(authorLogin || "")),
    });

  test("given mixed unsaved counters, when building blocked status text, then pluralized message parts are rendered", () => {
    const { buildAutoRenderBlockedStatusText } = createHelpers();

    expect(
      buildAutoRenderBlockedStatusText({
        dirtyFieldCount: 2,
        unsavedNotesCount: 1,
        blockingAuthorInsightsCount: 3,
      }),
    ).toBe(
      "Auto updates are paused until changes are saved. 2 unsaved fields | 1 note section unsaved | 3 author insight drafts unsaved",
    );
  });

  test("given no unsaved counters, when building blocked status text, then baseline paused message is returned", () => {
    const { buildAutoRenderBlockedStatusText } = createHelpers();

    expect(buildAutoRenderBlockedStatusText({})).toBe(
      "Auto updates are paused until changes are saved.",
    );
  });

  test("given no PR label and author logins, when building links aria label, then display-name label is returned", () => {
    const { buildAutoRenderBlockedLinksAriaLabel } = createHelpers();

    expect(
      buildAutoRenderBlockedLinksAriaLabel({
        blockingPrLabel: "",
        blockingAuthorInsightsLogins: ["bob", "alice"],
      }),
    ).toBe("Blocking author drafts: Bob B, Alice A");
  });

  test("given PR label, when building links aria label, then PR label is preferred", () => {
    const { buildAutoRenderBlockedLinksAriaLabel } = createHelpers();

    expect(
      buildAutoRenderBlockedLinksAriaLabel({
        blockingPrLabel: "Blocking PRs: #2",
        blockingAuthorInsightsLogins: ["alice"],
      }),
    ).toBe("Blocking PRs: #2");
  });
});
