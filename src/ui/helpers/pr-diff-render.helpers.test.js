/** @jest-environment jsdom */

const {
  createPrDiffRenderHelpers,
} = require("./pr-diff-render.helpers.js");

describe("pr diff render helpers", () => {
  test("given representative diff lines, when line types are detected, then each line maps to the expected type", () => {
    const helpers = createPrDiffRenderHelpers({ documentRef: document });

    expect(helpers.getDiffLineType("diff --git a/a.js b/a.js")).toBe("file");
    expect(helpers.getDiffLineType("index abcd..efgh 100644")).toBe("meta");
    expect(helpers.getDiffLineType("@@ -1,2 +1,3 @@")).toBe("hunk");
    expect(helpers.getDiffLineType("+const x = 1;")).toBe("add");
    expect(helpers.getDiffLineType("-const x = 1;")).toBe("del");
    expect(helpers.getDiffLineType(" context line")).toBe("context");
  });

  test("given multi-file diff text, when rendering to a container, then grouped file blocks and line rows are created", () => {
    const clearCalls = [];
    const helpers = createPrDiffRenderHelpers({
      clearElementChildren: (node) => {
        clearCalls.push(node);
        node.innerHTML = "";
      },
      documentRef: document,
    });

    const container = document.createElement("div");
    helpers.renderDiffText(
      container,
      [
        "diff --git a/src/a.js b/src/a.js",
        "index 123..456 100644",
        "@@ -1,1 +1,1 @@",
        "+added",
        "diff --git a/src/b.js b/src/b.js",
        "-removed",
      ].join("\n"),
    );

    expect(clearCalls).toEqual([container]);
    expect(container.dataset.rawDiff).toContain("diff --git a/src/a.js b/src/a.js");
    expect(container.querySelectorAll(".pr-json-diff-file-block")).toHaveLength(2);
    expect(container.textContent).toContain("src/a.js -> src/a.js");
    expect(container.textContent).toContain("src/b.js -> src/b.js");
    expect(container.textContent).toContain("added");
    expect(container.textContent).toContain("removed");
  });

  test("given empty diff input, when rendering, then container still stores raw diff and renders a blank context row", () => {
    const helpers = createPrDiffRenderHelpers({
      clearElementChildren: (node) => {
        node.innerHTML = "";
      },
      documentRef: document,
    });

    const container = document.createElement("div");
    helpers.renderDiffText(container, "");

    expect(container.dataset.rawDiff).toBe("");
    const rows = container.querySelectorAll(".pr-json-diff-line");
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toBe(" ");
  });
});
