// react-app.tsx installs these two window listeners before mounting.
//
// Some browsers' password managers throw errors like
// "ControlLooksLikePasswordCredentialField" while inspecting the page's plain
// text inputs. They are harmless noise; these listeners swallow just those,
// so they don't reach the console (or e2e's no-console-errors check).
const IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS = [
  "ControlLooksLikePasswordCredentialField",
  "UsernameElementUniqueID",
];

export const isIgnoredCredentialFieldError = (value: unknown): boolean => {
  const text = String(value || "");
  return IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS.some((marker) =>
    text.includes(marker),
  );
};

// Returns a function that removes both listeners (used by tests).
export const installCredentialFieldErrorFilters = (
  target: Pick<Window, "addEventListener" | "removeEventListener">,
): (() => void) => {
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reasonMessage =
      event?.reason?.message ||
      event?.reason?.stack ||
      String(event?.reason || "");
    if (isIgnoredCredentialFieldError(reasonMessage)) {
      event.preventDefault();
      return;
    }
    console.error("Unhandled promise rejection:", event.reason);
  };
  const onError = (event: ErrorEvent) => {
    if (isIgnoredCredentialFieldError(event?.message)) {
      event.preventDefault();
    }
  };

  target.addEventListener("unhandledrejection", onUnhandledRejection);
  target.addEventListener("error", onError);
  return () => {
    target.removeEventListener("unhandledrejection", onUnhandledRejection);
    target.removeEventListener("error", onError);
  };
};
