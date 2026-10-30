// Form-field parsing for the Run Script and filter inputs, plus the props
// that keep password managers away from plain text fields.

// The attributes that tell browsers and password managers (LastPass,
// 1Password, Bitwarden) a plain text field isn't a credential field, as
// React props - spread onto the Run Script/filter/notes text inputs
// (ContextRunScriptTextInput, PrNumberFilterInput, NotesStoriesField,
// ReviewStatsControls).
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
  const toBoolean = (value: unknown): boolean => value === true || value === "on";

  // Accept comma and/or whitespace separators while preserving numeric-only IDs.
  const parsePrNumbersInput = (input: unknown): string[] => {
    if (!input || typeof input !== "string") return [];

    return String(input)
      .split(/[\s,]+/)
      .map((s) => String(s || "").trim())
      .filter((token) => /^\d+$/.test(token));
  };

  // Parse commit patterns from textarea (one pattern per line).
  const parseCommitPatterns = (textarea: { value?: unknown } | null | undefined): string[] => {
    const value = textarea?.value || "";
    if (!value || typeof value !== "string") return [];

    return String(value)
      .split("\n")
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  };

  // Comma-separated values, trimmed, empty ones dropped.
  const parseCsvTokens = (rawValue: unknown): string[] =>
    String(rawValue || "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

  // Format commit patterns array for textarea display (one per line).
  const formatCommitPatternsForTextarea = (patterns: unknown): string => {
    if (!Array.isArray(patterns)) return "";
    return patterns.join("\n");
  };

  return {
    toBoolean,
    parsePrNumbersInput,
    parseCommitPatterns,
    parseCsvTokens,
    formatCommitPatternsForTextarea,
  };
};

export const {
  toBoolean,
  parsePrNumbersInput,
  parseCommitPatterns,
  parseCsvTokens,
  formatCommitPatternsForTextarea,
} = createFormParsingHelpers();
