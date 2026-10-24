// The { title, detail } a failure snackbar shows (useSinglePrUpdate and the
// other action hooks): the first useful message from an error/result
// object, with "(timed out)" added to the title for timeouts.

export const isTimeoutFailureMessage = (value: unknown): boolean =>
  /\b(timed?\s*out|timeout|deadline exceeded)\b/i.test(String(value || ""));

// A thrown error or a failed route result: any of these may carry the text.
export interface FailureSource {
  error?: unknown;
  summary?: unknown;
  message?: unknown;
  stderr?: unknown;
  output?: unknown;
}

export interface FailureSnackbarNotification {
  title: string;
  detail: string;
}

export const buildFailureSnackbarNotification = (
  title: string,
  errorSource: unknown,
  fallbackMessage: string = "Operation failed",
): FailureSnackbarNotification => {
  const source = errorSource as FailureSource | null;
  const messageCandidates =
    source && typeof source === "object"
      ? [source.error, source.summary, source.message, source.stderr, source.output]
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
