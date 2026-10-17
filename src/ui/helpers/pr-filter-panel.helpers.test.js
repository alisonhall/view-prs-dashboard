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
      <details class="multi-select-dropdown" open>
        <summary class="multi-select-summary">Authors</summary>
        <div id="author-list"></div>
      </details>
    `;
  });

  // Phase 7, sub-phase 7.4 (see REACT_MIGRATION_PLAN.md): getSelectedAuthorLogins/
  // getSelectedIncludeLabelNames/etc. are the one piece of this factory
  // that still reads real DOM state (the currently-checked values) - the
  // populateXOptions functions that used to build those same lists moved
  // to FilterOptionsProvider.jsx/react-app.jsx's MultiSelectListPortals.
  test("given checked checkboxes in a list, when reading the selected values, then it returns them trimmed", () => {
    const component = createPrFilterPanelHelpers({ documentRef: document });
    document.getElementById("author-list").innerHTML = `
      <input type="checkbox" value=" alice " checked />
      <input type="checkbox" value="bob" />
    `;

    expect(component.getSelectedAuthorLogins()).toEqual(["alice"]);
  });

  test("given a Context override for a metadata filter, when reading it, then the Context value wins over the DOM read", () => {
    const component = createPrFilterPanelHelpers({
      documentRef: document,
      getFilterStateValue: (key) => (key === "filterCustomComments" ? "with" : undefined),
    });

    expect(component.getCustomCommentsFilter()).toBe("with");
  });
});
