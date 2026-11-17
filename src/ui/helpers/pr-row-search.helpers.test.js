const { collectSearchTexts, matchRowSearch, parseSearchTerms } = require("./pr-row-search.helpers.ts");

const entry = {
  repo: "acme/api",
  prNumber: "12",
  data: {
    number: 12,
    title: "Fix the Parser",
    author: "Ada Lovelace",
    authorLogin: "ada",
    sourceBranch: "feature/tokenizer",
    targetBranch: "release/2.0",
  },
  notes: {
    comments: [{ author: "Grace", note: "Needs a regression test" }],
    otherNotes: "Blocked on infra",
    prDifficulty: "3 - medium",
    stories: [{ name: "US1234", url: "https://tracker.example.com/US1234" }],
    analysisOfPr: "Touches the lexer",
  },
};

describe("parseSearchTerms", () => {
  test("lower-case words, once each, whatever the spacing", () => {
    expect(parseSearchTerms("  Fix   parser fix ")).toEqual(["fix", "parser"]);
    expect(parseSearchTerms("")).toEqual([]);
    expect(parseSearchTerms(undefined)).toEqual([]);
  });
});

describe("collectSearchTexts", () => {
  test("notes from the row when the entry has none (older data)", () => {
    const texts = collectSearchTexts({ data: { ...entry.data, notes: { otherNotes: "Old note" } } });
    expect(texts.otherNotes).toBe("old note");
  });
});

describe("matchRowSearch", () => {
  test("every word has to be found somewhere, in any case and order", () => {
    expect(matchRowSearch(entry, ["parser", "fix"]).matches).toBe(true);
    expect(matchRowSearch(entry, ["parser", "nowhere"]).matches).toBe(false);
  });

  test.each([
    ["title", "parser"],
    ["author", "lovelace"],
    ["author", "ada"],
    ["branch", "tokenizer"],
    ["branch", "release/2.0"],
    ["comments", "regression"],
    ["comments", "grace"],
    ["otherNotes", "infra"],
    ["difficulty", "medium"],
    ["stories", "us1234"],
    ["stories", "tracker.example.com"],
    ["analysis", "lexer"],
  ])("finds a word in the %s (%s)", (_field, term) => {
    expect(matchRowSearch(entry, [term]).matches).toBe(true);
  });

  test("the author's name as the row shows it, when given", () => {
    expect(matchRowSearch(entry, ["countess"]).matches).toBe(false);
    expect(matchRowSearch(entry, ["countess"], ["Countess of Lovelace"]).matches).toBe(true);
  });

  test("says which fields the row doesn't show a word was only found in", () => {
    expect(matchRowSearch(entry, ["parser"]).hiddenFields).toEqual([]);
    expect(matchRowSearch(entry, ["parser", "regression"]).hiddenFields).toEqual(["comments"]);
    expect(matchRowSearch(entry, ["tokenizer", "infra"]).hiddenFields).toEqual(["branch", "otherNotes"]);
    // Kept when another word isn't found (in the table, it was in the
    // author's shown name, which the row's note isn't given).
    expect(matchRowSearch(entry, ["countess", "regression"])).toEqual({ matches: false, hiddenFields: ["comments"] });
    // Found in the title too: the row shows why it's there.
    expect(matchRowSearch({ ...entry, notes: { otherNotes: "parser rewrite" } }, ["parser"]).hiddenFields).toEqual([]);
  });

  test("no words: every row, with nothing to say", () => {
    expect(matchRowSearch(entry, [])).toEqual({ matches: true, hiddenFields: [] });
  });
});
