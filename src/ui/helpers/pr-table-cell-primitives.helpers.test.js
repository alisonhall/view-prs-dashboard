/** @jest-environment jsdom */

const {
  createPrTableCellPrimitivesHelpers,
} = require("./pr-table-cell-primitives.helpers.js");

describe("pr table cell primitives helpers", () => {
  const columnClasses = ["col-0", "col-1", "col-2"];

  const createHelpers = () =>
    createPrTableCellPrimitivesHelpers({
      getTableColumnClass: (index) => columnClasses[index] || "",
      documentRef: document,
    });

  test("given a compact header definition, when creating a header cell, then compact hover structure and labels are rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createHeaderCell(
      { shortLabel: "Sel", fullLabel: "Select PR", compact: true },
      0,
      "Updated",
    );

    expect(result?.className).toBe("col-0 compact-hover-header");
    expect(result?.getAttribute("scope")).toBe("col");
    expect(result?.getAttribute("title")).toBe("Select PR");
    expect(result?.getAttribute("aria-label")).toBe("Select PR");
    expect(result?.querySelector(".compact-header-abbrev")?.textContent).toBe("Sel");
    expect(result?.querySelector(".compact-header-hover")?.textContent).toBe("Select PR");
  });

  test("given a null header token, when creating a header cell, then date header text is used", () => {
    const helpers = createHelpers();

    const result = helpers.createHeaderCell(null, 1, "Last Updated");

    expect(result?.className).toBe("col-1");
    expect(result?.textContent).toBe("Last Updated");
  });

  test("given a plain header label, when creating a header cell, then the direct header text is rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createHeaderCell("PR", 2, "Ignored");

    expect(result?.className).toBe("col-2");
    expect(result?.textContent).toBe("PR");
  });

  test("given cell text and class name, when creating a text cell, then cell class and fallback text are applied", () => {
    const helpers = createHelpers();

    const valueCell = helpers.createTextCell("PASS", "check-cell");
    const emptyCell = helpers.createTextCell(undefined, "check-cell");

    expect(valueCell?.className).toBe("check-cell");
    expect(valueCell?.textContent).toBe("PASS");
    expect(emptyCell?.textContent).toBe("");
  });
});
