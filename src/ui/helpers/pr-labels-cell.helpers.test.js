/** @jest-environment jsdom */

const {
  createPrLabelsCellHelpers,
} = require("./pr-labels-cell.helpers.js");

describe("pr labels cell helpers", () => {
  const createHelpers = () =>
    createPrLabelsCellHelpers({
      getLabelName: (label) => String(label?.name || label || "").trim(),
      documentRef: document,
    });

  test("given no labels, when creating labels cell, then dash placeholder is rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createLabelsCell([]);

    expect(result?.className).toBe("labels-cell");
    expect(result?.textContent).toBe("-");
  });

  test("given string and object labels, when creating labels cell, then chips are rendered with normalized names", () => {
    const helpers = createHelpers();

    const result = helpers.createLabelsCell(["bug", { name: "feature" }]);
    const chips = Array.from(result?.querySelectorAll(".label-chip") || []);

    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.textContent)).toEqual(["bug", "feature"]);
  });

  test("given a label name, when creating labels cell, then stable hash-based class suffix is applied", () => {
    const helpers = createHelpers();

    const result = helpers.createLabelsCell(["bug"]);
    const chip = result?.querySelector(".label-chip");

    expect(chip?.className).toBe("label-chip label-chip-3");
  });
});
