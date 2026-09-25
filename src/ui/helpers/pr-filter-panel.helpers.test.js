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
      <details class="multi-select-dropdown" open>
        <summary class="multi-select-summary">Exclude labels</summary>
        <div id="exclude-label-list"></div>
      </details>
      <details class="multi-select-dropdown" open>
        <summary class="multi-select-summary">Assigned</summary>
        <div id="assigned-list"></div>
      </details>
      <details class="multi-select-dropdown" open>
        <summary class="multi-select-summary">Approvers</summary>
        <div id="approver-list"></div>
      </details>
    `;
  });

  // Regression guard: this helper module has no DOM-building of its own
  // left (see REACT_MIGRATION_PLAN.md/AppliedFilterSummary.jsx) - it must
  // delegate every render to the injected renderFilterSummary/
  // renderMultiSelectList hooks, never touch document.createElement.
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

  test("given pending label selections, when populating include labels, then renderMultiSelectList is called with the restored checked state and pending state is cleared", () => {
    const pendingState = { labels: ["frontend"] };
    const renderMultiSelectList = jest.fn();
    const component = createPrFilterPanelHelpers({
      extractRowLabelNames: (row) => row.labels || [],
      normalizeFilterToken: (value) => String(value || "").trim().toLowerCase(),
      getPendingLabelFilterSelections: () => pendingState.labels,
      setPendingLabelFilterSelections: (value) => {
        pendingState.labels = value;
      },
      renderMultiSelectList,
      documentRef: document,
    });

    component.populateIncludeLabelOptions(
      [
        { repo: "owner/repo", data: { labels: ["frontend", "bug"] } },
        { repo: "owner/repo", data: { labels: ["backend"] } },
      ],
      "owner/repo",
    );

    expect(renderMultiSelectList).toHaveBeenCalledWith("label-list", [
      { value: "backend", label: "backend", checked: false },
      { value: "bug", label: "bug", checked: false },
      { value: "frontend", label: "frontend", checked: true },
    ]);
    expect(pendingState.labels).toBeNull();
  });

  test("given pending author selections, when populating author options, then renderMultiSelectList is called with actor names sorted and the restored checked state, and selection persists", () => {
    const pendingState = { authors: ["author-b"] };
    const renderMultiSelectList = jest.fn();
    const component = createPrFilterPanelHelpers({
      getPreferredActorKey: (authorLogin) => String(authorLogin || "").trim(),
      resolveActorDisplayName: (_login, _actorsMap, fallback) => String(fallback || ""),
      getPendingAuthorFilterSelections: () => pendingState.authors,
      setPendingAuthorFilterSelections: (value) => {
        pendingState.authors = value;
      },
      renderMultiSelectList,
      documentRef: document,
    });

    component.populateAuthorOptions(
      [
        { repo: "owner/repo", data: { authorLogin: "author-b", author: "Beta" } },
        { repo: "owner/repo", data: { authorLogin: "author-a", author: "Alpha" } },
      ],
      "owner/repo",
      {},
    );

    expect(renderMultiSelectList).toHaveBeenCalledWith("author-list", [
      { value: "author-a", label: "Alpha", checked: false },
      { value: "author-b", label: "Beta", checked: true },
    ]);
    expect(pendingState.authors).toBeNull();
  });

  test("given no renderMultiSelectList hook, when populating options, then it is a safe no-op (no DOM built directly)", () => {
    const component = createPrFilterPanelHelpers({
      extractRowLabelNames: (row) => row.labels || [],
      documentRef: document,
    });

    expect(() =>
      component.populateIncludeLabelOptions(
        [{ repo: "owner/repo", data: { labels: ["frontend"] } }],
        "owner/repo",
      ),
    ).not.toThrow();
    expect(document.getElementById("label-list")?.children).toHaveLength(0);
  });

  // Deferred-items follow-up (full vanilla-to-React sweep, see
  // REACT_MIGRATION_PLAN.md): updateMultiSelectSummary was deleted from
  // this factory - MultiSelectCheckboxList.jsx now owns the summary count
  // text directly (see its own test file's "empty-state class and summary
  // count" describe block for the equivalent coverage).

  test("given a getOrCompute cache, when populating include labels twice for the same entries, then label extraction is only computed once per entry", () => {
    const extractRowLabelNames = jest.fn((row) => row.labels || []);
    const cache = new Map();
    const getOrCompute = (entry, cacheKey, compute) => {
      const key = `${entry.repo}:${entry.data.number}:${cacheKey}`;
      if (!cache.has(key)) {
        cache.set(key, compute());
      }
      return cache.get(key);
    };
    const component = createPrFilterPanelHelpers({
      extractRowLabelNames,
      getOrCompute,
      renderMultiSelectList: () => {},
      documentRef: document,
    });
    const entries = [
      { repo: "owner/repo", data: { number: "1", labels: ["frontend"] } },
      { repo: "owner/repo", data: { number: "2", labels: ["backend"] } },
    ];

    component.populateIncludeLabelOptions(entries, "owner/repo");
    component.populateIncludeLabelOptions(entries, "owner/repo");

    expect(extractRowLabelNames).toHaveBeenCalledTimes(2);
  });
});
