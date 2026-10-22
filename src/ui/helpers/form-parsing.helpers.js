// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. Importers use it
// directly instead of the require()/globalThis.ViewPrsFormParsingHelpers
// fallback.
//
// Cleanup pass (prompted by a direct question about leftover vanilla code,
// see REACT_MIGRATION_PLAN.md): getSelectedAuthorLogins (this factory's
// former fourth export) is deleted outright - it read option.selected off
// a `<select id="author">`, a field that was replaced by the "author-list"
// checkbox multi-select (RowFilterSelectionContext) long before this
// cleanup pass, leaving zero real caller anywhere (confirmed via grep -
// only its own unit tests still called it).

// Window-bridge elimination Phase 7.5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the attributes that tell browsers and password managers (LastPass,
// 1Password, Bitwarden) a plain text field isn't a credential field, as React
// props - spread onto the Run Script/filter text inputs
// (ContextRunScriptTextInput, PrNumberFilterInput). This replaces
// applyCredentialHints, which index.page.js ran over those inputs by DOM id
// once React had rendered them (hence its 'viewprs:react-ready' listener).
export const NON_CREDENTIAL_INPUT_PROPS = Object.freeze({
  autoComplete: "off",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
});

export const createFormParsingHelpers = () => {
  const toBoolean = (value) => value === true || value === "on";

  // Accept comma and/or whitespace separators while preserving numeric-only IDs.
  const parsePrNumbersInput = (input) => {
    if (!input || typeof input !== "string") return [];

    return String(input)
      .split(/[\s,]+/)
      .map((s) => String(s || "").trim())
      .filter((token) => /^\d+$/.test(token));
  };

  // Parse commit patterns from textarea (one pattern per line).
  const parseCommitPatterns = (textarea) => {
    const value = textarea?.value || "";
    if (!value || typeof value !== "string") return [];

    return String(value)
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  };

  // Format commit patterns array for textarea display (one per line).
  const formatCommitPatternsForTextarea = (patterns) => {
    if (!Array.isArray(patterns)) return "";
    return patterns.join("\n");
  };

  return {
    toBoolean,
    parsePrNumbersInput,
    parseCommitPatterns,
    formatCommitPatternsForTextarea,
  };
};

export const {
  toBoolean,
  parsePrNumbersInput,
  parseCommitPatterns,
  formatCommitPatternsForTextarea,
} = createFormParsingHelpers();
