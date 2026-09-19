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
      const expandedByKey = new Map();
      collectNodesByClassSafe(sectionsHost, "row-insights-toggle").forEach(
        (button) => {
          const prNumber = readElementAttributeSafe(button, "data-pr-number").trim();
          const sectionKey = readElementAttributeSafe(button, "data-section-key").trim();
          if (!prNumber || !sectionKey) return;
          
          // Use composite key: "section:prNumber" to track each instance independently
          // This allows same PR in multiple sections to have different states
          const compositeKey = `${sectionKey}:${prNumber}`;
          const isExpanded =
            readElementAttributeSafe(button, "aria-expanded") === "true";
          // Store BOTH expanded (true) and collapsed (false) states
          // This ensures closed PRs are restored to closed state on re-render
          expandedByKey.set(compositeKey, isExpanded);
        },
      );
      return expandedByKey;
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

    const restoreExpandedInsightsState = (sectionsHost, expandedByKey) => {
      if (!(expandedByKey instanceof Map) || expandedByKey.size === 0) return;
      collectNodesByClassSafe(sectionsHost, "row-insights-toggle").forEach(
        (button) => {
          const prNumber = readElementAttributeSafe(button, "data-pr-number").trim();
          const sectionKey = readElementAttributeSafe(button, "data-section-key").trim();
          if (!prNumber || !sectionKey) return;
          
          // Use same composite key: "section:prNumber"
          const compositeKey = `${sectionKey}:${prNumber}`;
          
          // Skip if this specific section+PR instance was never tracked
          if (!expandedByKey.has(compositeKey)) return;
          
          // Get saved state for this specific section+PR combination
          const savedIsExpanded = expandedByKey.get(compositeKey);
          const currentIsExpanded =
            readElementAttributeSafe(button, "aria-expanded") === "true";
          
          // Toggle only if saved state doesn't match current state
          if (savedIsExpanded !== currentIsExpanded && typeof button.onclick === "function") {
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
