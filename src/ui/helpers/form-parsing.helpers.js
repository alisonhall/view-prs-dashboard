(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFormParsingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createFormParsingHelpers = () => {
    const toBoolean = (value) => value === true || value === "on";

    const getSelectedAuthorLogins = (authorSelect) => {
      const selectElement = authorSelect || document.getElementById("author");
      if (!selectElement) return [];

      const options = Array.from(selectElement.options || []);
      return options
        .filter((option) => option.selected)
        .map((option) => String(option.value || "").trim())
        .filter(Boolean);
    };

    const applyCredentialHints = (input, fieldName, options = {}) => {
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
      getSelectedAuthorLogins,
      applyCredentialHints,
      parsePrNumbersInput,
      parseCommitPatterns,
      formatCommitPatternsForTextarea,
    };
  };

  const defaultHelpers = createFormParsingHelpers();

  return {
    createFormParsingHelpers,
    ...defaultHelpers,
  };
});
