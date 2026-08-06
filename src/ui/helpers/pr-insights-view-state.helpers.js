(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsInsightsViewStateHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrInsightsViewStateHelpers = ({
    captureExpandedInsightsState,
    captureOpenInnerInsightSectionsState,
    restoreExpandedInsightsState,
    restoreOpenInnerInsightSectionsState,
  } = {}) => {
    const captureExpandedInsightsStateSafe =
      typeof captureExpandedInsightsState === "function"
        ? captureExpandedInsightsState
        : () => new Map();
    const captureOpenInnerInsightSectionsStateSafe =
      typeof captureOpenInnerInsightSectionsState === "function"
        ? captureOpenInnerInsightSectionsState
        : () => new Map();
    const restoreExpandedInsightsStateSafe =
      typeof restoreExpandedInsightsState === "function"
        ? restoreExpandedInsightsState
        : () => {};
    const restoreOpenInnerInsightSectionsStateSafe =
      typeof restoreOpenInnerInsightSectionsState === "function"
        ? restoreOpenInnerInsightSectionsState
        : () => {};

    const captureInsightsViewState = (sectionsHost) => ({
      expandedInsightsState: captureExpandedInsightsStateSafe(sectionsHost),
      openInnerInsightSectionsState:
        captureOpenInnerInsightSectionsStateSafe(sectionsHost),
    });

    const restoreInsightsViewState = (sectionsHost, viewState = {}) => {
      const expandedInsightsState = viewState?.expandedInsightsState;
      const openInnerInsightSectionsState =
        viewState?.openInnerInsightSectionsState;

      restoreExpandedInsightsStateSafe(sectionsHost, expandedInsightsState);
      restoreOpenInnerInsightSectionsStateSafe(
        sectionsHost,
        openInnerInsightSectionsState,
      );
    };

    return {
      captureInsightsViewState,
      restoreInsightsViewState,
    };
  };

  return {
    createPrInsightsViewStateHelpers,
  };
});
