/** @jest-environment jsdom */

const {
  createPrRenderApplyInputsHelpers,
} = require("./pr-render-apply-inputs.helpers.js");

describe("pr render apply inputs helpers", () => {
  test("given render apply source values, when deriving render apply inputs, then normalized apply inputs are returned", () => {
    const { deriveRenderApplyInputs } = createPrRenderApplyInputsHelpers();
    const payload = { actorsMap: { me: ["login"] } };

    const result = deriveRenderApplyInputs({
      payload,
      allStoredRows: [{ id: 1 }],
      sectionsHost: { id: "host" },
      meta: { textContent: "" },
      appliedSummaryText: "Applied",
      filterChips: ["repo=org/repo"],
      grouped: { opened: [{ id: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-17T00:00:00Z",
      selectedScope: "last-run",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [123] },
    });

    expect(result).toEqual({
      payload,
      allStoredRows: [{ id: 1 }],
      sectionsHost: { id: "host" },
      meta: { textContent: "" },
      appliedSummaryText: "Applied",
      filterChips: ["repo=org/repo"],
      grouped: { opened: [{ id: 1 }] },
      prSectionOpenState: { opened: true },
      lastSuccessfulRenderedCheckAt: "2026-07-17T00:00:00Z",
      selectedScope: "last-run",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
      insightsViewState: { expanded: ["1"] },
      latestSchedulerState: { activePrNumbers: [123] },
    });
  });

  test("given invalid render apply source values, when deriving render apply inputs, then safe defaults are used", () => {
    const { deriveRenderApplyInputs } = createPrRenderApplyInputsHelpers();

    const result = deriveRenderApplyInputs({
      payload: 1,
      allStoredRows: null,
      sectionsHost: null,
      meta: 2,
      appliedSummaryText: null,
      filterChips: null,
      grouped: null,
      prSectionOpenState: null,
      lastSuccessfulRenderedCheckAt: null,
      selectedScope: null,
      repoFilter: null,
      latestSelectedRepo: null,
      insightsViewState: null,
      latestSchedulerState: null,
    });

    expect(result).toEqual({
      payload: null,
      allStoredRows: [],
      sectionsHost: null,
      meta: null,
      appliedSummaryText: "",
      filterChips: [],
      grouped: {},
      prSectionOpenState: {},
      lastSuccessfulRenderedCheckAt: "",
      selectedScope: "all",
      repoFilter: "",
      latestSelectedRepo: "",
      insightsViewState: {},
      latestSchedulerState: {},
    });
  });
});
