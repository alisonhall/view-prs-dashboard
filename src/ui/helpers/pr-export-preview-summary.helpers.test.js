const {
  createPrExportPreviewSummaryHelpers,
} = require("./pr-export-preview-summary.helpers.js");

describe("pr export preview summary helpers", () => {
  test("given section host with open and closed groups, when collecting open section count, then only open sections are counted", () => {
    const sectionsHost = {
      children: [],
    };
    const openOne = { open: true };
    const closed = { open: false };
    const openTwo = { open: true };

    const { collectOpenPrSectionCount } = createPrExportPreviewSummaryHelpers({
      getOptionalElementById: (id) => (id === "pr-sections" ? sectionsHost : null),
      collectNodesByClass: () => [openOne, closed, openTwo],
    });

    const count = collectOpenPrSectionCount();

    expect(count).toBe(2);
  });

  test("given export payload and selected paths, when updating preview summary, then summary renderer receives computed counts", async () => {
    const sectionsHost = { children: [] };
    const renderExportSelectionSummary = jest.fn();

    const { updateExportPreviewSummary } = createPrExportPreviewSummaryHelpers({
      getLatestStoredPayload: () => ({
        byPrNumber: {
          "101": {},
          "202": {},
          "303": {},
        },
      }),
      getOptionalElementById: (id) => (id === "pr-sections" ? sectionsHost : null),
      getVisiblePrNumbersFromSectionsHost: () => ["101", "202"],
      getSelectedExportFieldPaths: () => ({
        dataPaths: ["data.title", "data.status"],
        userStatePaths: ["notesByPrNumber.otherNotes"],
      }),
      collectNodesByClass: () => [{ open: true }, { open: false }, { open: true }],
      renderExportSelectionSummary,
    });

    await updateExportPreviewSummary();

    expect(renderExportSelectionSummary).toHaveBeenCalledWith({
      dataCount: 2,
      userStateCount: 1,
      visibleCount: 2,
      totalVisibleCount: 3,
      openSectionsCount: 2,
    });
  });
});
