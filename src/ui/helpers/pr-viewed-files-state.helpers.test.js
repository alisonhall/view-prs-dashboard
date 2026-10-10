const { getViewedFilesState } = require("./pr-viewed-files-state.helpers.js");

describe("pr viewed files state helper", () => {
  test("given viewed less than changed, when resolving, then hasUnviewedFiles is true and isComplete is false", () => {
    expect(getViewedFilesState({ viewedFilesCount: 3, changedFilesCount: 5 })).toEqual({
      viewedFilesCount: 3,
      changedFilesCount: 5,
      isComplete: false,
      hasUnviewedFiles: true,
    });
  });

  test("given viewed equal to changed, when resolving, then isComplete is true and hasUnviewedFiles is false", () => {
    expect(getViewedFilesState({ viewedFilesCount: 5, changedFilesCount: 5 })).toEqual({
      viewedFilesCount: 5,
      changedFilesCount: 5,
      isComplete: true,
      hasUnviewedFiles: false,
    });
  });

  test("given no row at all, when resolving, then both counts default to 0 rather than throwing", () => {
    expect(getViewedFilesState(undefined)).toEqual({
      viewedFilesCount: 0,
      changedFilesCount: 0,
      isComplete: true,
      hasUnviewedFiles: false,
    });
  });
});
