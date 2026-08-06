/** @jest-environment jsdom */

const {
  createPrFilterPanelComponent,
} = require("./pr-filter-panel.component.js");

describe("pr filter panel component", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="management-filter-summary"></div>
      <div id="management-filter-chips"></div>
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

  test("given empty chips, when rendering management filter summary, then fallback chip and summary text are shown", () => {
    const component = createPrFilterPanelComponent({ documentRef: document });

    component.renderManagementFilterSummary({ summaryText: "Summary", filterChips: [] });

    expect(document.getElementById("management-filter-summary")?.textContent).toBe("Summary");
    expect(document.querySelectorAll("#management-filter-chips .applied-filter-chip")).toHaveLength(1);
    expect(document.getElementById("management-filter-chips")?.textContent).toContain("No filters applied");
  });

  test("given pending label selections, when populating include labels, then selected checkboxes are restored and pending state is cleared", () => {
    const pendingState = { labels: ["frontend"] };
    const component = createPrFilterPanelComponent({
      extractRowLabelNames: (row) => row.labels || [],
      normalizeFilterToken: (value) => String(value || "").trim().toLowerCase(),
      getPendingLabelFilterSelections: () => pendingState.labels,
      setPendingLabelFilterSelections: (value) => {
        pendingState.labels = value;
      },
      documentRef: document,
    });

    component.populateIncludeLabelOptions(
      [
        { repo: "owner/repo", data: { labels: ["frontend", "bug"] } },
        { repo: "owner/repo", data: { labels: ["backend"] } },
      ],
      "owner/repo",
    );

    const checkedValues = Array.from(
      document.querySelectorAll("#label-list input[type='checkbox']:checked"),
    ).map((node) => node.value);

    expect(checkedValues).toEqual(["frontend"]);
    expect(pendingState.labels).toBeNull();
    expect(document.querySelector("summary.multi-select-summary")?.textContent).toContain("1 selected");
  });

  test("given pending author selections, when populating author options, then actor names are rendered in sorted order and selection persists", () => {
    const pendingState = { authors: ["author-b"] };
    const component = createPrFilterPanelComponent({
      getPreferredActorKey: (authorLogin) => String(authorLogin || "").trim(),
      resolveActorDisplayName: (_login, _actorsMap, fallback) => String(fallback || ""),
      getPendingAuthorFilterSelections: () => pendingState.authors,
      setPendingAuthorFilterSelections: (value) => {
        pendingState.authors = value;
      },
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

    const labels = Array.from(document.querySelectorAll("#author-list label")).map((node) => node.textContent);
    const checkedValues = Array.from(
      document.querySelectorAll("#author-list input[type='checkbox']:checked"),
    ).map((node) => node.value);

    expect(labels).toEqual(["Alpha", "Beta"]);
    expect(checkedValues).toEqual(["author-b"]);
    expect(pendingState.authors).toBeNull();
  });
});
