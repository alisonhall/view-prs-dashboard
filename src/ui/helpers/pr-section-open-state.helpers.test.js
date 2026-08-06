/** @jest-environment jsdom */

const {
  createPrSectionOpenStateHelpers,
} = require("./pr-section-open-state.helpers.js");

describe("pr section open state helpers", () => {
  const createHelpers = () =>
    createPrSectionOpenStateHelpers({
      collectNodesByClass: (root, className) =>
        root && typeof root.querySelectorAll === "function"
          ? Array.from(root.querySelectorAll(`.${className}`))
          : [],
      readElementAttribute: (element, name) =>
        element && typeof element.getAttribute === "function"
          ? String(element.getAttribute(name) || "")
          : "",
    });

  test("given section details elements, when capturing open state, then section keys map to open booleans", () => {
    document.body.innerHTML = `
      <div id="host">
        <details class="pr-group-section" data-pr-section="open" open></details>
        <details class="pr-group-section" data-pr-section="draft"></details>
      </div>
    `;
    const host = document.getElementById("host");
    const { capturePrSectionOpenState } = createHelpers();

    const state = capturePrSectionOpenState(host);

    expect(state.get("open")).toBe(true);
    expect(state.get("draft")).toBe(false);
  });

  test("given captured state and fallback values, when resolving section open state, then captured value wins and fallback is used for missing keys", () => {
    const { resolvePrSectionOpenState } = createHelpers();
    const openState = new Map([
      ["open", true],
      ["draft", false],
    ]);

    expect(resolvePrSectionOpenState(openState, "open", false)).toBe(true);
    expect(resolvePrSectionOpenState(openState, "draft", true)).toBe(false);
    expect(resolvePrSectionOpenState(openState, "merged", true)).toBe(true);
  });
});
