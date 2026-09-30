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
      filteredRows: [{ id: 1 }],
      sectionsHost: { id: "host" },
      meta: { textContent: "" },
      appliedSummaryText: "Applied",
      filterChips: ["repo=org/repo"],
      selectedScope: "last-run",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
    });

    expect(result).toEqual({
      payload,
      allStoredRows: [{ id: 1 }],
      filteredRows: [{ id: 1 }],
      sectionsHost: { id: "host" },
      meta: { textContent: "" },
      appliedSummaryText: "Applied",
      filterChips: ["repo=org/repo"],
      selectedScope: "last-run",
      repoFilter: "org/repo",
      latestSelectedRepo: "org/repo",
    });
  });

  test("given invalid render apply source values, when deriving render apply inputs, then safe defaults are used", () => {
    const { deriveRenderApplyInputs } = createPrRenderApplyInputsHelpers();

    const result = deriveRenderApplyInputs({
      payload: 1,
      allStoredRows: null,
      filteredRows: null,
      sectionsHost: null,
      meta: 2,
      appliedSummaryText: null,
      filterChips: null,
      selectedScope: null,
      repoFilter: null,
      latestSelectedRepo: null,
    });

    expect(result).toEqual({
      payload: null,
      allStoredRows: [],
      filteredRows: [],
      sectionsHost: null,
      meta: null,
      appliedSummaryText: "",
      filterChips: [],
      selectedScope: "all",
      repoFilter: "",
      latestSelectedRepo: "",
    });
  });
});
