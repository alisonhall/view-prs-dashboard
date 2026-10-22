//
// Phase 7 (see REACT_MIGRATION_PLAN.md): safeJsonStringify hoisted to a
// bare module-scope export, alongside the factory - it's genuinely
// zero-dependency (unlike parseMarkerState, deliberately left inside the
// factory/deferred as part of the Track C cluster - see
// AuthorInsightsPrDataMeta.jsx's own header comment), so PrJsonModal.jsx/
// ExportTab.jsx can import it directly instead of reading it off
// window.safeJsonStringify. The factory's own copy just returns this same
// function, not a duplicate, matching AuthorInsightsProvider.jsx's own
// "hoist payload/identity-independent functions to module scope" fix.
export const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
};

const createPrUiRenderUtilsHelpers = () => {
  const parseMarkerState = (titleDisplay = "", marker = "CHK") => {
    const match = String(titleDisplay || "").match(
      new RegExp(`\\[${marker}:([^\\]]+)\\]`),
    );
    return match && match[1] ? String(match[1]).trim().toUpperCase() : "-";
  };

  return {
    parseMarkerState,
    safeJsonStringify,
  };
};

export { createPrUiRenderUtilsHelpers };
