/** @jest-environment jsdom */

const {
  createPrSelectionCellHelpers,
} = require("./pr-selection-cell.helpers.js");

describe("pr selection cell helpers", () => {
  test("given a selected pr number, when creating the selection cell, then the row checkbox is checked and titled for that pr", () => {
    const helpers = createPrSelectionCellHelpers({
      getSelectedPrNumbers: () => ["101"],
      updateSelectedPrNumbers: () => {},
      documentRef: document,
    });

    const result = helpers.createSelectionCell({ number: "101" });
    const checkbox = result?.querySelector(".row-select-checkbox");

    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.getAttribute("data-pr-number")).toBe("101");
    expect(checkbox?.title).toBe("Select PR #101");
  });

  test("given an empty pr number, when creating the selection cell, then the generic title is used", () => {
    const helpers = createPrSelectionCellHelpers({
      getSelectedPrNumbers: () => [],
      updateSelectedPrNumbers: () => {},
      documentRef: document,
    });

    const result = helpers.createSelectionCell({});
    const checkbox = result?.querySelector(".row-select-checkbox");

    expect(checkbox?.checked).toBe(false);
    expect(checkbox?.title).toBe("Select PR");
  });

  test("given a checkbox change, when toggled, then selection state updater is called with the pr number and checked state", () => {
    const calls = [];
    const helpers = createPrSelectionCellHelpers({
      getSelectedPrNumbers: () => [],
      updateSelectedPrNumbers: (prNumber, checked) => {
        calls.push([prNumber, checked]);
      },
      documentRef: document,
    });

    const result = helpers.createSelectionCell({ number: "202" });
    const checkbox = result?.querySelector(".row-select-checkbox");
    checkbox.checked = true;
    checkbox.onchange();

    expect(calls).toEqual([["202", true]]);
  });
});
