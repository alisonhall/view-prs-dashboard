(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsInsightsStateHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrInsightsStateHelpers = ({
    collectNodesByClass,
    collectNodesByTag,
    readElementAttribute,
  } = {}) => {
    const collectNodesByClassSafe =
      typeof collectNodesByClass === "function" ? collectNodesByClass : () => [];
    const collectNodesByTagSafe =
      typeof collectNodesByTag === "function" ? collectNodesByTag : () => [];
    const readElementAttributeSafe =
      typeof readElementAttribute === "function"
        ? readElementAttribute
        : () => "";

    const captureExpandedInsightsState = (sectionsHost) => {
      const expandedByPr = new Map();
      collectNodesByClassSafe(sectionsHost, "row-insights-toggle").forEach(
        (button) => {
          const prNumber = readElementAttributeSafe(button, "data-pr-number").trim();
          if (!prNumber) return;
          const isExpanded =
            readElementAttributeSafe(button, "aria-expanded") === "true";
          if (isExpanded) {
            expandedByPr.set(prNumber, true);
          }
        },
      );
      return expandedByPr;
    };

    const captureOpenInnerInsightSectionsState = (sectionsHost) => {
      const openByPr = new Map();
      collectNodesByClassSafe(sectionsHost, "row-insights-content").forEach(
        (panel) => {
          const prNumber = readElementAttributeSafe(panel, "data-pr-number").trim();
          if (!prNumber) return;

          const openKeys = new Set();
          collectNodesByTagSafe(panel, "details").forEach((detailsEl) => {
            const key = readElementAttributeSafe(detailsEl, "data-insight-key").trim();
            if (!key) return;
            if (detailsEl.open === true) {
              openKeys.add(key);
            }
          });

          if (openKeys.size > 0) {
            openByPr.set(prNumber, openKeys);
          }
        },
      );
      return openByPr;
    };

    const restoreExpandedInsightsState = (sectionsHost, expandedByPr) => {
      if (!(expandedByPr instanceof Map) || expandedByPr.size === 0) return;
      collectNodesByClassSafe(sectionsHost, "row-insights-toggle").forEach(
        (button) => {
          const prNumber = readElementAttributeSafe(button, "data-pr-number").trim();
          if (!prNumber || !expandedByPr.get(prNumber)) return;
          const isExpanded =
            readElementAttributeSafe(button, "aria-expanded") === "true";
          if (!isExpanded && typeof button.onclick === "function") {
            button.onclick();
          }
        },
      );
    };

    const restoreOpenInnerInsightSectionsState = (sectionsHost, openByPr) => {
      if (!(openByPr instanceof Map) || openByPr.size === 0) return;
      collectNodesByClassSafe(sectionsHost, "row-insights-content").forEach(
        (panel) => {
          const prNumber = readElementAttributeSafe(panel, "data-pr-number").trim();
          const openKeys = openByPr.get(prNumber);
          if (!prNumber || !(openKeys instanceof Set) || openKeys.size === 0) {
            return;
          }

          collectNodesByTagSafe(panel, "details").forEach((detailsEl) => {
            const key = readElementAttributeSafe(detailsEl, "data-insight-key").trim();
            if (!key || !openKeys.has(key)) return;
            detailsEl.open = true;
            if (typeof detailsEl.setAttribute === "function") {
              detailsEl.setAttribute("open", "");
            }
          });
        },
      );
    };

    return {
      captureExpandedInsightsState,
      captureOpenInnerInsightSectionsState,
      restoreExpandedInsightsState,
      restoreOpenInnerInsightSectionsState,
    };
  };

  return {
    createPrInsightsStateHelpers,
  };
});
