// The page's last vanilla code: credential-manager hints on the plain text
// fields, the multi-select dropdowns' outside-click closing, and two global
// error filters. Everything else this file used to orchestrate (data
// loading and polling, backfill and scheduler status, request activity, the
// auto-render-blocking state, filter persistence, and the window.* bridges
// that connected them to React) now lives in React Providers mounted by
// react-app.jsx's mountAppRoot(). See REACT_MIGRATION_PLAN.md,
// WINDOW_BRIDGE_ELIMINATION_PLAN.md and this file's git history for where
// each piece went.
//
// Window-bridge elimination Phase 7.4: the auto-render-blocking cluster
// (recomputeDirtyPrSectionsFields and its helpers, the #pr-sections
// input/change/click listeners that triggered it, the actor-login alias
// cache, and window.recomputeDirtyPrSectionsFields) moved to
// components/AutoRenderBlockingSync.jsx, which computes the same state from
// NotesDirtyContext and the drafts Context.
import * as formParsingHelpersModule from "./helpers/form-parsing.helpers.js";
import * as prDomAccessHelperFactory from "./helpers/pr-dom-access.helpers.js";
import * as prFilterPanelHelperFactory from "./helpers/pr-filter-panel.helpers.js";

const formParsingHelpers = formParsingHelpersModule;

const { getOptionalElementById } =
  prDomAccessHelperFactory.createPrDomAccessHelpers({
    documentRef: typeof document !== "undefined" ? document : null,
  });

const markInputAsNonCredentialField = (
  input,
  fieldName,
  options = { overrideName: true },
) => {
  if (formParsingHelpers?.applyCredentialHints) {
    formParsingHelpers.applyCredentialHints(input, fieldName, options);
    return;
  }

  if (!input) return;
  if (options.overrideName !== false && fieldName) {
    input.name = fieldName;
  }
  input.autocomplete = "off";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
};

const NON_CREDENTIAL_HINT_FIELD_IDS = [
  "repo",
  "pr-numbers",
  "limit",
  "merged-limit",
  "jobs",
  "filter-pr-numbers",
];

const applyNonCredentialFieldHints = () => {
  NON_CREDENTIAL_HINT_FIELD_IDS.forEach((id) => {
    const input = getOptionalElementById(id);
    if (!input) return;
    markInputAsNonCredentialField(input, "", { overrideName: false });
  });
};

const IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS = [
  "ControlLooksLikePasswordCredentialField",
  "UsernameElementUniqueID",
];

const isIgnoredCredentialFieldError = (value) => {
  const text = String(value || "");
  return IGNORED_CREDENTIAL_FIELD_ERROR_MARKERS.some((marker) =>
    text.includes(marker),
  );
};

// Only the dropdown-closing listener survives from this factory - the
// option populators and selection readers it used to provide moved to
// FilterOptionsProvider.jsx/MultiSelectListPortals (see REACT_MIGRATION_PLAN.md).
const { setupMultiSelectDropdownClosing } = prFilterPanelHelperFactory.createPrFilterPanelHelpers({
  documentRef: typeof document !== "undefined" ? document : null,
});

const initPage = () => {
  // applyNonCredentialFieldHints() reaches for the "Run Script options"
  // fields (repo/limit/merged-limit/jobs/pr-numbers) by DOM id, but they're
  // React-portaled (FilterStateProvider, see ContextRunScriptTextInput.jsx)
  // and don't exist yet at this point in a real page load. So it re-runs on
  // 'viewprs:react-ready' (AppRoot's last effect). The immediate call below
  // finds nothing in a real load and no-ops; it's kept for any environment
  // where the markup is already there (a test harness that injects it up
  // front).
  window.addEventListener(
    "viewprs:react-ready",
    () => applyNonCredentialFieldHints(),
    { once: true },
  );
  applyNonCredentialFieldHints();

  setupMultiSelectDropdownClosing();
};

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reasonMessage =
      event?.reason?.message ||
      event?.reason?.stack ||
      String(event?.reason || "");
    if (isIgnoredCredentialFieldError(reasonMessage)) {
      event.preventDefault();
      return;
    }
    console.error("Unhandled promise rejection:", event.reason);
  });

  window.addEventListener("error", (event) => {
    if (isIgnoredCredentialFieldError(event?.message)) {
      event.preventDefault();
    }
  });
}

if (typeof document !== "undefined") {
  initPage();
}
