/** @jest-environment jsdom */

const {
  createPrFilterPanelHelpers,
} = require("./pr-filter-panel.helpers.js");

describe("pr filter panel helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <details class="multi-select-dropdown" open>
        <summary class="multi-select-summary">Labels</summary>
        <div id="label-list"></div>
      </details>
      <button id="outside"></button>
    `;
  });

  test("given an open multi-select dropdown, when a click lands outside it, then the dropdown closes", () => {
    const { setupMultiSelectDropdownClosing } = createPrFilterPanelHelpers({
      documentRef: document,
    });

    setupMultiSelectDropdownClosing();
    document.getElementById("outside").click();

    expect(document.querySelector(".multi-select-dropdown").open).toBe(false);
  });

  test("given an open multi-select dropdown, when a click lands inside it, then the dropdown stays open", () => {
    const { setupMultiSelectDropdownClosing } = createPrFilterPanelHelpers({
      documentRef: document,
    });

    setupMultiSelectDropdownClosing();
    document.getElementById("label-list").click();

    expect(document.querySelector(".multi-select-dropdown").open).toBe(true);
  });

  test("given no multi-select dropdowns in the document, when setting up, then it exits without throwing", () => {
    document.body.innerHTML = "";
    const { setupMultiSelectDropdownClosing } = createPrFilterPanelHelpers({
      documentRef: document,
    });

    expect(() => setupMultiSelectDropdownClosing()).not.toThrow();
  });
});
