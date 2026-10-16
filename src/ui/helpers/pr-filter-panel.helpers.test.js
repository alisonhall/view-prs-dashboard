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

  // Regression guard: this helper module has no DOM-building of its own
  // left (see REACT_MIGRATION_PLAN.md/AppliedFilterSummary.jsx) - it must
  // delegate every render to the injected renderFilterSummary hook, never
  // touch document.createElement.
  test("given a renderFilterSummary hook, when rendering the management filter summary, then it is called with the summary text and chips (no DOM built directly)", () => {
    const renderFilterSummary = jest.fn();
    const component = createPrFilterPanelHelpers({ renderFilterSummary, documentRef: document });

    component.renderManagementFilterSummary({ summaryText: "Summary", filterChips: ["a", "b"] });

    expect(renderFilterSummary).toHaveBeenCalledWith("Summary", ["a", "b"]);
  });

  test("given no renderFilterSummary hook, when rendering the management filter summary, then it is a safe no-op", () => {
    const component = createPrFilterPanelHelpers({ documentRef: document });

    expect(() =>
      component.renderManagementFilterSummary({ summaryText: "Summary", filterChips: [] }),
    ).not.toThrow();
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
