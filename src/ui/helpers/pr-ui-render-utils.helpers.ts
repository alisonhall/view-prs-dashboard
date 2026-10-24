// safeJsonStringify is also a bare export so PrJsonModal/ExportTab can
// import it directly; the factory returns this same function.
export const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
};

const createPrUiRenderUtilsHelpers = () => {
  // Reads a "[CHK:PASS]"-style marker out of a PR's titleDisplay; "-" when
  // the marker is absent.
  const parseMarkerState = (titleDisplay: unknown = "", marker: string = "CHK"): string => {
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
