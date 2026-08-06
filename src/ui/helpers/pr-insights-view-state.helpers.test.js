const {
  createPrInsightsViewStateHelpers,
} = require("./pr-insights-view-state.helpers.js");

describe("pr insights view state helpers", () => {
  test("given section host, when capturing view state, then expanded and open-inner snapshots are collected", () => {
    const captureExpandedInsightsState = jest.fn(() => new Map([["101", true]]));
    const captureOpenInnerInsightSectionsState = jest.fn(
      () => new Map([["101", new Set(["summary"])]]),
    );

    const { captureInsightsViewState } = createPrInsightsViewStateHelpers({
      captureExpandedInsightsState,
      captureOpenInnerInsightSectionsState,
    });

    const host = { id: "pr-sections" };
    const state = captureInsightsViewState(host);

    expect(captureExpandedInsightsState).toHaveBeenCalledWith(host);
    expect(captureOpenInnerInsightSectionsState).toHaveBeenCalledWith(host);
    expect(state.expandedInsightsState.get("101")).toBe(true);
    expect(state.openInnerInsightSectionsState.get("101") instanceof Set).toBe(
      true,
    );
  });

  test("given captured snapshots, when restoring view state, then both restore handlers are invoked with captured data", () => {
    const restoreExpandedInsightsState = jest.fn();
    const restoreOpenInnerInsightSectionsState = jest.fn();
    const { restoreInsightsViewState } = createPrInsightsViewStateHelpers({
      restoreExpandedInsightsState,
      restoreOpenInnerInsightSectionsState,
    });

    const host = { id: "pr-sections" };
    const state = {
      expandedInsightsState: new Map([["101", true]]),
      openInnerInsightSectionsState: new Map([["101", new Set(["summary"])]])
    };

    restoreInsightsViewState(host, state);

    expect(restoreExpandedInsightsState).toHaveBeenCalledWith(
      host,
      state.expandedInsightsState,
    );
    expect(restoreOpenInnerInsightSectionsState).toHaveBeenCalledWith(
      host,
      state.openInnerInsightSectionsState,
    );
  });
});
