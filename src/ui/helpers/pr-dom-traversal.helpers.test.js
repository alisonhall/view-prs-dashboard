/** @jest-environment jsdom */

const { createPrDomTraversalHelpers } = require("./pr-dom-traversal.helpers.js");

describe("pr dom traversal helpers", () => {
  test("given nested elements, when collecting nodes by class, then matching nodes are returned depth-first", () => {
    document.body.innerHTML = `
      <div class="target" id="a">
        <div>
          <span class="target" id="b"></span>
        </div>
      </div>
    `;

    const { collectNodesByClass } = createPrDomTraversalHelpers();
    const nodes = collectNodesByClass(document.body, "target");

    expect(nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });

  test("given nested elements, when collecting nodes by tag, then matching tags are returned depth-first", () => {
    document.body.innerHTML = `
      <div id="root">
        <details id="a"></details>
        <div>
          <details id="b"></details>
        </div>
      </div>
    `;

    const { collectNodesByTag } = createPrDomTraversalHelpers();
    const nodes = collectNodesByTag(document.getElementById("root"), "details");

    expect(nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });

  test("given no matching nodes, when collecting by class or tag, then an empty array is returned", () => {
    const { collectNodesByClass, collectNodesByTag } = createPrDomTraversalHelpers();

    expect(collectNodesByClass(null, "missing")).toEqual([]);
    expect(collectNodesByTag(null, "details")).toEqual([]);
  });
});
