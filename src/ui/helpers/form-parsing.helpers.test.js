/**
 * @jest-environment jsdom
 */

const {
  toBoolean,
  NON_CREDENTIAL_INPUT_PROPS,
  parsePrNumbersInput,
  parseCommitPatterns,
  formatCommitPatternsForTextarea,
} = require("../helpers/form-parsing.helpers");
const React = require("react");
const { render } = require("@testing-library/react");

describe("form-parsing.helpers", () => {
  describe("toBoolean", () => {
    test("given true when normalizing then it remains true", () => {
      expect(toBoolean(true)).toBe(true);
    });

    test("given 'on' when normalizing then it maps to true", () => {
      expect(toBoolean("on")).toBe(true);
    });

    test("given non-true values when normalizing then they map to false", () => {
      expect(toBoolean(false)).toBe(false);
      expect(toBoolean("off")).toBe(false);
      expect(toBoolean(null)).toBe(false);
      expect(toBoolean(undefined)).toBe(false);
      expect(toBoolean("true")).toBe(false);
      expect(toBoolean(1)).toBe(false);
      expect(toBoolean("")).toBe(false);
    });
  });

  // Window-bridge elimination Phase 7.5: replaces applyCredentialHints (a DOM
  // pass index.page.js ran over the inputs). React renders these props as the
  // same attributes the old function set - checked here through a real render.
  describe("NON_CREDENTIAL_INPUT_PROPS", () => {
    test("given an input rendered with the props, when read, then every credential-hint attribute is set as before", () => {
      const { container } = render(
        React.createElement("input", { type: "text", name: "repo", ...NON_CREDENTIAL_INPUT_PROPS }),
      );
      const input = container.querySelector("input");

      expect(input.getAttribute("data-lpignore")).toBe("true");
      expect(input.getAttribute("data-1p-ignore")).toBe("true");
      expect(input.getAttribute("data-bwignore")).toBe("true");
      expect(input.getAttribute("autocomplete")).toBe("off");
      expect(input.getAttribute("autocapitalize")).toBe("off");
      expect(input.getAttribute("autocorrect")).toBe("off");
      expect(input.getAttribute("spellcheck")).toBe("false");
      expect(input.getAttribute("data-form-type")).toBe("other");
      expect(input.name).toBe("repo");
    });

    test("given the shared props object, when a caller tries to change it, then it stays unchanged (frozen)", () => {
      expect(Object.isFrozen(NON_CREDENTIAL_INPUT_PROPS)).toBe(true);
    });
  });

  describe("parsePrNumbersInput", () => {
    test("given comma-separated numeric IDs when parsing then all IDs are returned", () => {
      expect(parsePrNumbersInput("912, 921")).toEqual(["912", "921"]);
    });

    test("given whitespace-separated numeric IDs when parsing then all IDs are returned", () => {
      expect(parsePrNumbersInput("912 921")).toEqual(["912", "921"]);
    });

    test("given mixed comma and whitespace separators when parsing then all numeric IDs are returned", () => {
      expect(parsePrNumbersInput("912, 921, 300")).toEqual([
        "912",
        "921",
        "300",
      ]);
    });

    test("given padded numeric IDs when parsing then surrounding whitespace is ignored", () => {
      expect(parsePrNumbersInput("  912  ,  921  ")).toEqual(["912", "921"]);
    });

    test("given empty input when parsing then an empty array is returned", () => {
      expect(parsePrNumbersInput("")).toEqual([]);
      expect(parsePrNumbersInput(null)).toEqual([]);
      expect(parsePrNumbersInput(undefined)).toEqual([]);
    });

    test("given extra delimiters when parsing then only valid numeric IDs are returned", () => {
      expect(parsePrNumbersInput("912,,921")).toEqual(["912", "921"]);
      expect(parsePrNumbersInput("912  ,  ,\n921\t")).toEqual(["912", "921"]);
    });

    test("given empty and non-numeric tokens when parsing then only numeric IDs are kept", () => {
      expect(parsePrNumbersInput("912, , 921")).toEqual(["912", "921"]);
      expect(parsePrNumbersInput("912,foo, 921 bar")).toEqual(["912", "921"]);
    });
  });

  describe("parseCommitPatterns", () => {
    test("given textarea with patterns on separate lines, when parsing, then returns array of patterns", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "^docs:\n^test:\n^chore:";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual(["^docs:", "^test:", "^chore:"]);
    });

    test("given textarea with whitespace around patterns, when parsing, then patterns are trimmed", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "  ^docs:  \n  ^test:  \n  ^chore:  ";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual(["^docs:", "^test:", "^chore:"]);
    });

    test("given textarea with empty lines, when parsing, then empty lines are filtered out", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "^docs:\n\n^test:\n   \n^chore:";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual(["^docs:", "^test:", "^chore:"]);
    });

    test("given empty textarea, when parsing, then returns empty array", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual([]);
    });

    test("given textarea with only whitespace, when parsing, then returns empty array", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "\n  \n   \n";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual([]);
    });

    test("given null textarea, when parsing, then returns empty array", () => {
      const result = parseCommitPatterns(null);
      expect(result).toEqual([]);
    });

    test("given textarea with single pattern, when parsing, then returns single-item array", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "^docs:";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual(["^docs:"]);
    });

    test("given textarea with complex regex patterns, when parsing, then preserves pattern syntax", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "^chore\\(deps\\):\n(?i)^wip:\n^Bump .* from";

      const result = parseCommitPatterns(textarea);
      expect(result).toEqual(["^chore\\(deps\\):", "(?i)^wip:", "^Bump .* from"]);
    });
  });

  describe("formatCommitPatternsForTextarea", () => {
    test("given array of patterns, when formatting, then returns patterns joined by newlines", () => {
      const patterns = ["^docs:", "^test:", "^chore:"];

      const result = formatCommitPatternsForTextarea(patterns);
      expect(result).toBe("^docs:\n^test:\n^chore:");
    });

    test("given empty array, when formatting, then returns empty string", () => {
      const result = formatCommitPatternsForTextarea([]);
      expect(result).toBe("");
    });

    test("given null, when formatting, then returns empty string", () => {
      const result = formatCommitPatternsForTextarea(null);
      expect(result).toBe("");
    });

    test("given single pattern, when formatting, then returns single line", () => {
      const patterns = ["^docs:"];

      const result = formatCommitPatternsForTextarea(patterns);
      expect(result).toBe("^docs:");
    });

    test("given non-array, when formatting, then returns empty string", () => {
      const result = formatCommitPatternsForTextarea("not-an-array");
      expect(result).toBe("");
    });
  });
});
