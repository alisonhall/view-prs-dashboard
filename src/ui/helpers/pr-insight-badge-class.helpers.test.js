const {
  createPrInsightBadgeClassHelpers,
} = require("./pr-insight-badge-class.helpers.js");

describe("pr insight badge class helpers", () => {
  test("given changed-like status values, when resolving status badge class, then changed class is returned", () => {
    const helpers = createPrInsightBadgeClassHelpers({
      isChangedStatus: (status) => String(status || "").startsWith("CHANGED"),
    });

    expect(helpers.getBadgeClassForStatus("CHANGED")).toBe("insight-badge-status-changed");
    expect(helpers.getBadgeClassForStatus("CHANGED(commit)")).toBe("insight-badge-status-changed");
  });

  test("given known non-changed status values, when resolving status badge class, then mapped classes are returned", () => {
    const helpers = createPrInsightBadgeClassHelpers({
      isChangedStatus: () => false,
    });

    expect(helpers.getBadgeClassForStatus("NO_CHANGE")).toBe("insight-badge-status-no-change");
    expect(helpers.getBadgeClassForStatus("NO_ACTIVITY")).toBe("insight-badge-status-no-activity");
    expect(helpers.getBadgeClassForStatus("OTHER")).toBe("");
  });

  test("given check states, when resolving check badge class, then known values map and unknown falls back to na", () => {
    const helpers = createPrInsightBadgeClassHelpers();

    expect(helpers.getBadgeClassForCheck("PASS")).toBe("insight-badge-check-pass");
    expect(helpers.getBadgeClassForCheck("FAIL")).toBe("insight-badge-check-fail");
    expect(helpers.getBadgeClassForCheck("RUN")).toBe("insight-badge-check-run");
    expect(helpers.getBadgeClassForCheck("SKIP")).toBe("insight-badge-check-skip");
    expect(helpers.getBadgeClassForCheck("UNKNOWN")).toBe("insight-badge-check-na");
  });

  test("given merge states, when resolving merge badge class, then known values map and unknown falls back to unknown class", () => {
    const helpers = createPrInsightBadgeClassHelpers();

    expect(helpers.getBadgeClassForMerge("YES")).toBe("insight-badge-merge-yes");
    expect(helpers.getBadgeClassForMerge("NO")).toBe("insight-badge-merge-no");
    expect(helpers.getBadgeClassForMerge("MAYBE")).toBe("insight-badge-merge-unk");
  });
});
