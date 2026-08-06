/** @jest-environment jsdom */

const {
  createPrMergedRequestMoreHelpers,
} = require("./pr-merged-request-more.helpers.js");

describe("pr merged request more helpers", () => {
  test("given action is hidden, when appending merged request more action, then no action row is rendered", () => {
    const host = document.createElement("div");
    const { appendMergedRequestMoreAction } = createPrMergedRequestMoreHelpers({
      documentRef: document,
    });

    appendMergedRequestMoreAction(host, { isVisible: false, repo: "org/repo" });

    expect(host.children.length).toBe(0);
  });

  test("given action is visible and pending, when appending merged request more action, then button is disabled and status text is rendered", () => {
    const host = document.createElement("div");
    const { appendMergedRequestMoreAction } = createPrMergedRequestMoreHelpers({
      getIsRequestMoreMergedPending: () => true,
      documentRef: document,
    });

    appendMergedRequestMoreAction(host, { isVisible: true, repo: "org/repo" });

    const button = host.querySelector("#merged-request-more-btn");
    const status = host.querySelector("#merged-request-more-status");
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(status.textContent).toBe("Request in progress...");
  });

  test("given action is visible, when request more button is clicked, then request handler is called with repo", () => {
    const host = document.createElement("div");
    const handleRequestMoreMerged = jest.fn();
    const { appendMergedRequestMoreAction } = createPrMergedRequestMoreHelpers({
      handleRequestMoreMerged,
      getIsRequestMoreMergedPending: () => false,
      documentRef: document,
    });

    appendMergedRequestMoreAction(host, {
      isVisible: true,
      repo: "optum-rx-clinicalproducts/orx-cpp-mp-uis",
    });

    host.querySelector("#merged-request-more-btn").click();
    expect(handleRequestMoreMerged).toHaveBeenCalledWith(
      "optum-rx-clinicalproducts/orx-cpp-mp-uis",
    );
  });
});
