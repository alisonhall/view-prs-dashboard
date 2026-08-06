/** @jest-environment jsdom */

const {
  createPrLinesChangedInsightHelpers,
} = require("./pr-lines-changed-insight.helpers.js");

describe("pr lines changed insight helpers", () => {
  const createHelpers = () =>
    createPrLinesChangedInsightHelpers({
      toCount: (value) => {
        const parsed = Number.parseInt(String(value ?? "").trim(), 10);
        return Number.isFinite(parsed) ? parsed : 0;
      },
      documentRef: document,
    });

  test("given missing additions or deletions, when creating line-change insight content, then dash placeholder is returned", () => {
    const helpers = createHelpers();

    expect(helpers.createLinesChangedInsightContent({ additions: "", deletions: "4" })).toBe("-");
    expect(helpers.createLinesChangedInsightContent({ additions: "4", deletions: "" })).toBe("-");
  });

  test("given line-change counts and file count, when creating line-change insight content, then github-style summary spans are rendered", () => {
    const helpers = createHelpers();

    const result = helpers.createLinesChangedInsightContent({
      additions: "10",
      deletions: "3",
      changedFilesCount: 2,
    });

    expect(result?.className).toBe("insight-line-changes");
    expect(result?.querySelector(".insight-line-changes-files")?.textContent).toBe("2 files changed");
    expect(result?.querySelector(".insight-line-changes-additions")?.textContent).toBe("+10 additions");
    expect(result?.querySelector(".insight-line-changes-deletions")?.textContent).toBe("-3 deletions");
    expect(result?.querySelector(".insight-line-changes-total")?.textContent).toBe("13 lines changed");
  });

  test("given one changed file, when creating line-change insight content, then singular file label is used", () => {
    const helpers = createHelpers();

    const result = helpers.createLinesChangedInsightContent({
      additions: "1",
      deletions: "1",
      changedFilesCount: 1,
    });

    expect(result?.querySelector(".insight-line-changes-files")?.textContent).toBe("1 file changed");
  });
});
