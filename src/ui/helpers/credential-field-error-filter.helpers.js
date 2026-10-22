// Window-bridge elimination Phase 7.5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// moved from index.page.js, which installed these two listeners at module
// load. react-app.jsx installs them before mounting, the same point in page
// startup.
//
// Some browsers' password managers throw errors like
// "ControlLooksLikePasswordCredentialField" while inspecting the page's plain
// text inputs. They are harmless noise; these listeners swallow just those,
// so they don't reach the console (or e2e's no-console-errors check).
const IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS = [
  "ControlLooksLikePasswordCredentialField",
  "UsernameElementUniqueID",
];

export const isIgnoredCredentialFieldError = (value) => {
  const text = String(value || "");
  return IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS.some((marker) =>
    text.includes(marker),
  );
};

// Returns a function that removes both listeners (used by tests).
export const installCredentialFieldErrorFilters = (target) => {
  const onUnhandledRejection = (event) => {
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
  const onError = (event) => {
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
