/**
 * @jest-environment jsdom
 */

const {
  toBoolean,
  getSelectedAuthorLogins,
  applyCredentialHints,
  parsePrNumbersInput,
  parseCommitPatterns,
  formatCommitPatternsForTextarea,
} = require("../helpers/form-parsing.helpers");

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

  describe("getSelectedAuthorLogins", () => {
    test("given a multi-select with no selected options when reading authors then it returns an empty array", () => {
      const select = document.createElement("select");
      select.id = "author";
      select.multiple = true;
      const option1 = document.createElement("option");
      option1.value = "author1";
      option1.textContent = "Author One";
      const option2 = document.createElement("option");
      option2.value = "author2";
      option2.textContent = "Author Two";
      select.appendChild(option1);
      select.appendChild(option2);

      // Explicitly deselect all in a multi-select
      Array.from(select.options).forEach((opt) => {
        opt.selected = false;
      });

      const result = getSelectedAuthorLogins(select);
      expect(result).toEqual([]);
    });

    test("given selected author options when reading authors then it returns selected logins", () => {
      const select = document.createElement("select");
      select.id = "author";
      select.multiple = true;
      const option1 = document.createElement("option");
      option1.value = "author1";
      option1.textContent = "Author One";
      const option2 = document.createElement("option");
      option2.value = "author2";
      option2.textContent = "Author Two";
      const option3 = document.createElement("option");
      option3.value = "author3";
      option3.textContent = "Author Three";
      select.appendChild(option1);
      select.appendChild(option2);
      select.appendChild(option3);

      // Select specific options
      option1.selected = true;
      option2.selected = true;
      option3.selected = false;

      const result = getSelectedAuthorLogins(select);
      expect(result).toEqual(["author1", "author2"]);
    });

    test("given selected author values with whitespace when reading authors then values are trimmed", () => {
      const select = document.createElement("select");
      select.id = "author";
      select.multiple = true;
      const option1 = document.createElement("option");
      option1.value = "  author1  ";
      option1.textContent = "Author One";
      const option2 = document.createElement("option");
      option2.value = "";
      option2.textContent = "Empty";
      select.appendChild(option1);
      select.appendChild(option2);

      option1.selected = true;
      option2.selected = false;

      const result = getSelectedAuthorLogins(select);
      expect(result).toEqual(["author1"]);
    });

    test("given no author select element when reading authors then it returns an empty array", () => {
      const result = getSelectedAuthorLogins(null);
      expect(result).toEqual([]);
    });

    test("given no explicit select when reading authors then it falls back to the page author select", () => {
      document.body.innerHTML = `<select id="author">
        <option value="author1" selected="true">Author One</option>
      </select>`;

      const result = getSelectedAuthorLogins();
      expect(result).toEqual(["author1"]);
    });
  });

  describe("applyCredentialHints", () => {
    test("given a text input when applying credential hints then ignore and autocomplete attributes are set", () => {
      const input = document.createElement("input");
      input.type = "text";

      applyCredentialHints(input, "test-field");

      expect(input.getAttribute("data-lpignore")).toBe("true");
      expect(input.getAttribute("data-1p-ignore")).toBe("true");
      expect(input.getAttribute("data-bwignore")).toBe("true");
      expect(input.getAttribute("autocomplete")).toBe("off");
      expect(input.getAttribute("autocapitalize")).toBe("off");
      expect(input.getAttribute("autocorrect")).toBe("off");
      expect(input.getAttribute("spellcheck")).toBe("false");
      expect(input.getAttribute("data-form-type")).toBe("other");
    });

    test("given a field name when applying credential hints then the input name is set", () => {
      const input = document.createElement("input");
      input.type = "text";

      applyCredentialHints(input, "repo");

      expect(input.name).toBe("repo");
    });

    test("given override disabled when applying credential hints then an existing field name is preserved", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.name = "existing-name";

      applyCredentialHints(input, "new-name", { overrideName: false });

      expect(input.name).toBe("existing-name");
    });

    test("given no field name when applying credential hints then the input name is unchanged", () => {
      const input = document.createElement("input");
      input.type = "text";

      applyCredentialHints(input);

      expect(input.name).toBe("");
    });

    test("given nullish input when applying credential hints then no exception is thrown", () => {
      expect(() => applyCredentialHints(null, "field")).not.toThrow();
      expect(() => applyCredentialHints(undefined, "field")).not.toThrow();
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
