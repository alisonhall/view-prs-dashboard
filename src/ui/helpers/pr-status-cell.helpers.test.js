/** @jest-environment jsdom */

const {
  createPrStatusCellHelpers,
} = require("./pr-status-cell.helpers.js");

describe("pr status cell helpers", () => {
  test("given changed status with reason and stale check info, when creating status cell, then summary text and stale indicator class are rendered", () => {
    const helpers = createPrStatusCellHelpers({
      isChangedStatus: (status) => String(status || "").startsWith("CHANGED"),
      statusClass: () => "status-changed",
      getViewedFilesState: () => ({
        viewedFilesCount: 1,
        changedFilesCount: 3,
        isComplete: false,
        hasUnviewedFiles: true,
      }),
      buildPrLastCheckedIndicator: () => ({
        label: "Checked 5m ago",
        title: "Last checked title",
        isStale: true,
      }),
      documentRef: document,
    });

    const result = helpers.createStatusCell(
      { status: "CHANGED", reason: "commit" },
      { lastCheckedAt: "2026-07-22T10:00:00Z", sectionKey: "open" },
    );

    expect(result?.className).toContain("status-cell");
    expect(result?.className).toContain("status-changed");
    expect(result?.querySelector(".status-cell-content > div")?.textContent).toBe(
      "CHANGED(commit)",
    );
    expect(result?.querySelector(".approved-viewed-progress")?.textContent).toBe("1/3");
    expect(result?.querySelector(".approved-viewed-progress")?.className).toContain(
      "approved-viewed-progress-incomplete",
    );
    expect(result?.querySelector(".pr-last-checked-indicator")?.textContent).toBe(
      "Checked 5m ago",
    );
    expect(result?.querySelector(".pr-last-checked-indicator")?.title).toBe(
      "Last checked title",
    );
    expect(
      result?.querySelector(".pr-last-checked-indicator")?.className || "",
    ).toContain("pr-last-checked-indicator-stale");
  });

  test("given unchanged status without reason and complete viewed files, when creating status cell, then complete progress class is rendered", () => {
    const helpers = createPrStatusCellHelpers({
      isChangedStatus: () => false,
      statusClass: () => "status-no-change",
      getViewedFilesState: () => ({
        viewedFilesCount: 4,
        changedFilesCount: 4,
        isComplete: true,
        hasUnviewedFiles: false,
      }),
      buildPrLastCheckedIndicator: () => ({
        label: "Checked now",
        title: "",
        isStale: false,
      }),
      documentRef: document,
    });

    const result = helpers.createStatusCell({ status: "NO_CHANGE", reason: "-" }, {});

    expect(result?.querySelector(".status-cell-content > div")?.textContent).toBe(
      "NO_CHANGE",
    );
    expect(result?.querySelector(".approved-viewed-progress")?.className).toContain(
      "approved-viewed-progress-complete",
    );
  });

  test("given missing status values, when creating status cell, then fallback status text is rendered", () => {
    const helpers = createPrStatusCellHelpers({
      isChangedStatus: () => false,
      statusClass: () => "",
      getViewedFilesState: () => ({
        viewedFilesCount: 0,
        changedFilesCount: 0,
        isComplete: false,
        hasUnviewedFiles: false,
      }),
      buildPrLastCheckedIndicator: () => ({
        label: "",
        title: "",
        isStale: false,
      }),
      documentRef: document,
    });

    const result = helpers.createStatusCell({}, {});

    expect(result?.querySelector(".status-cell-content > div")?.textContent).toBe("-");
    expect(result?.querySelector(".approved-viewed-progress")?.textContent).toBe("0/0");
  });
});
