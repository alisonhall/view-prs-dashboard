// Phase 7 (see REACT_MIGRATION_PLAN.md, useSinglePrUpdate's own entry):
// extracted out of index.page.js's notifyFailureSnackbar - genuinely pure,
// no state/DOM dependency (matching pr-row-sorting.helpers.js's own
// precedent: bare export, no createXHelpers() factory wrapper, since
// there's nothing to inject). Shared by index.page.js's own
// notifyFailureSnackbar (the vanilla path) and useSinglePrUpdate.jsx (the
// React path), so both build the same { title, detail } shape the same
// way instead of one reimplementing the other's logic.

export const isTimeoutFailureMessage = (value) =>
  /\b(timed?\s*out|timeout|deadline exceeded)\b/i.test(String(value || ""));

export const buildFailureSnackbarNotification = (
  title,
  errorSource,
  fallbackMessage = "Operation failed",
) => {
  const messageCandidates =
    errorSource && typeof errorSource === "object"
      ? [
          errorSource.error,
          errorSource.summary,
          errorSource.message,
          errorSource.stderr,
          errorSource.output,
        ]
      : [errorSource];

  const normalizedCandidates = messageCandidates
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const detail = normalizedCandidates[0] || fallbackMessage;
  const timeoutContext = normalizedCandidates.join("\n");
  const isTimeout = isTimeoutFailureMessage(timeoutContext);
  const finalTitle = isTimeout ? `${title} (timed out)` : title;

  return { title: finalTitle, detail };
};
