/** @jest-environment jsdom */

const {
  createPrReviewStatsControlsComponent,
} = require("./pr-review-stats-controls.component.js");

describe("review stats controls component", () => {
  test("given initial stats state, when controls are created, then initial values and credential-safe markers are applied", () => {
    const statsViewState = {
      sortBy: "approvals",
      filterMode: "high-risk-approvals",
      minComments: 3,
      topN: 8,
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    };
    const markedInputs = [];

    const component = createPrReviewStatsControlsComponent({
      statsViewState,
      toCount: (value) => Number(value) || 0,
      markInputAsNonCredentialField: (input, fieldName) => {
        markedInputs.push({ input, fieldName });
      },
      applyFiltersFromCache: () => {},
    });

    const controls = component.createStatsControls();

    expect(controls.querySelectorAll("label").length).toBe(6);
    const selectNodes = controls.querySelectorAll("select");
    expect(selectNodes[0].value).toBe("approvals");
    expect(selectNodes[1].value).toBe("high-risk-approvals");

    const numberInputs = controls.querySelectorAll('input[type="number"]');
    expect(numberInputs[0].value).toBe("3");
    expect(numberInputs[1].value).toBe("8");

    const dateInputs = controls.querySelectorAll('input[type="date"]');
    expect(dateInputs[0].value).toBe("2026-06-01");
    expect(dateInputs[1].value).toBe("2026-06-30");

    expect(markedInputs.map((entry) => entry.fieldName)).toEqual([
      "review-stats-start-date",
      "review-stats-end-date",
    ]);
  });

  test("given edited controls, when values change, then state updates and filters re-apply", () => {
    const statsViewState = {
      sortBy: "riskyApprovals",
      filterMode: "all",
      minComments: 0,
      topN: 12,
      startDate: "",
      endDate: "",
    };
    const applyFiltersFromCache = jest.fn();

    const component = createPrReviewStatsControlsComponent({
      statsViewState,
      toCount: (value) => Number(value) || 0,
      markInputAsNonCredentialField: () => {},
      applyFiltersFromCache,
    });

    const controls = component.createStatsControls();
    const selects = controls.querySelectorAll("select");
    const numberInputs = controls.querySelectorAll('input[type="number"]');
    const dateInputs = controls.querySelectorAll('input[type="date"]');

    selects[0].value = "comments";
    selects[0].dispatchEvent(new Event("change"));

    selects[1].value = "useful-comments";
    selects[1].dispatchEvent(new Event("change"));

    numberInputs[0].value = "5";
    numberInputs[0].dispatchEvent(new Event("change"));

    numberInputs[1].value = "0";
    numberInputs[1].dispatchEvent(new Event("change"));

    dateInputs[0].value = "2026-07-01";
    dateInputs[0].dispatchEvent(new Event("change"));

    dateInputs[1].value = "2026-07-10";
    dateInputs[1].dispatchEvent(new Event("change"));

    expect(statsViewState.sortBy).toBe("comments");
    expect(statsViewState.filterMode).toBe("useful-comments");
    expect(statsViewState.minComments).toBe(5);
    expect(statsViewState.topN).toBe(12);
    expect(statsViewState.startDate).toBe("2026-07-01");
    expect(statsViewState.endDate).toBe("2026-07-10");
    expect(applyFiltersFromCache).toHaveBeenCalledTimes(6);
  });
});
