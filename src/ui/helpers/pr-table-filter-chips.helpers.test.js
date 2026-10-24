const {
  createPrTableFilterChipsHelpers,
} = require("./pr-table-filter-chips.helpers.ts");

describe("pr table filter chips helpers", () => {
  describe("buildTableFilterChipsViewModel", () => {
    test("given every filter at its default value, when building chips, then returns an empty array", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      expect(
        buildTableFilterChipsViewModel({
          scopeMode: "all",
          filterPrNumbers: "",
          includeLabels: [],
          excludeLabels: [],
          authorLogins: [],
          assignedLogins: [],
          approverLogins: [],
          alwaysShowInReview: false,
          filterCustomComments: "",
          filterOtherNotes: "",
          filterPrDifficulty: "",
          filterStories: "",
          filterAnalysisOfPr: "",
        }),
      ).toEqual([]);
    });

    test("given no args at all, when building chips, then returns an empty array without throwing", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      expect(buildTableFilterChipsViewModel()).toEqual([]);
    });

    test("given a non-default scopeMode, when building chips, then includes a Scope chip clearing back to 'all'", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ scopeMode: "needs-attention" });

      expect(chips).toEqual([
        {
          id: "scopeMode",
          label: "Scope: needs-attention",
          clear: { kind: "field", key: "scopeMode", value: "all" },
        },
      ]);
    });

    test("given an openMode value, when building chips, then it is ignored - openMode is a Run Script option, not a row-visibility filter", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      expect(buildTableFilterChipsViewModel({ openMode: "changed" })).toEqual([]);
    });

    test("given filterPrNumbers set, when building chips, then includes a trimmed PR # chip clearing back to ''", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ filterPrNumbers: "  123, 456  " });

      expect(chips).toEqual([
        {
          id: "filterPrNumbers",
          label: "PR #: 123, 456",
          clear: { kind: "field", key: "filterPrNumbers", value: "" },
        },
      ]);
    });

    test("given multiple selected labels, when building chips, then includes one chip per label each clearing just that one", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ includeLabels: ["bug", "urgent"] });

      expect(chips).toEqual([
        { id: "label-list:bug", label: "Label: bug", clear: { kind: "list", listId: "label-list", value: "bug" } },
        {
          id: "label-list:urgent",
          label: "Label: urgent",
          clear: { kind: "list", listId: "label-list", value: "urgent" },
        },
      ]);
    });

    test("given excluded labels, authors, assignees, and approvers, when building chips, then each gets its own prefixed chip", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({
        excludeLabels: ["wontfix"],
        authorLogins: ["alice"],
        assignedLogins: ["bob"],
        approverLogins: ["carol"],
      });

      expect(chips).toEqual([
        {
          id: "exclude-label-list:wontfix",
          label: "Exclude label: wontfix",
          clear: { kind: "list", listId: "exclude-label-list", value: "wontfix" },
        },
        {
          id: "author-list:alice",
          label: "Author: alice",
          clear: { kind: "list", listId: "author-list", value: "alice" },
        },
        {
          id: "assigned-list:bob",
          label: "Assigned: bob",
          clear: { kind: "list", listId: "assigned-list", value: "bob" },
        },
        {
          id: "approver-list:carol",
          label: "Approver: carol",
          clear: { kind: "list", listId: "approver-list", value: "carol" },
        },
      ]);
    });

    test("given alwaysShowInReview is true, when building chips, then includes a chip clearing it back to false", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ alwaysShowInReview: true });

      expect(chips).toEqual([
        {
          id: "alwaysShowInReview",
          label: "Always show in review",
          clear: { kind: "field", key: "alwaysShowInReview", value: false },
        },
      ]);
    });

    test.each([
      ["filterCustomComments", "Custom comments", "with"],
      ["filterCustomComments", "Custom comments", "without"],
      ["filterOtherNotes", "Other notes", "with"],
      ["filterAnalysisOfPr", "Analysis of PR", "without"],
    ])("given %s set to '%s', when building chips, then includes a '%s: %s' chip clearing back to ''", (key, prefix, value) => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ [key]: value });

      expect(chips).toEqual([
        { id: key, label: `${prefix}: ${value}`, clear: { kind: "field", key, value: "" } },
      ]);
    });

    test.each([
      ["none", "without any story details"],
      ["name-only", "with only story name"],
      ["url-only", "with only story URL"],
      ["name-and-url", "with story and URL"],
    ])("given filterStories set to '%s', when building chips, then includes a 'Stories: %s' chip clearing back to ''", (value, label) => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      expect(buildTableFilterChipsViewModel({ filterStories: value })).toEqual([
        { id: "filterStories", label: `Stories: ${label}`, clear: { kind: "field", key: "filterStories", value: "" } },
      ]);
    });

    test("given filterPrDifficulty set to a level, when building chips, then includes a Difficulty chip with that level", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ filterPrDifficulty: "medium" });

      expect(chips).toEqual([
        {
          id: "filterPrDifficulty",
          label: "Difficulty: medium",
          clear: { kind: "field", key: "filterPrDifficulty", value: "" },
        },
      ]);
    });

    test("given filterPrDifficulty set to 'not-set', when building chips, then renders the label as 'not set'", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({ filterPrDifficulty: "not-set" });

      expect(chips).toEqual([
        {
          id: "filterPrDifficulty",
          label: "Difficulty: not set",
          clear: { kind: "field", key: "filterPrDifficulty", value: "" },
        },
      ]);
    });

    test("given several filters active at once, when building chips, then returns all of them together", () => {
      const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

      const chips = buildTableFilterChipsViewModel({
        scopeMode: "needs-attention",
        filterPrNumbers: "42",
        includeLabels: ["bug"],
        authorLogins: ["alice"],
        alwaysShowInReview: true,
      });

      expect(chips.map((chip) => chip.id)).toEqual([
        "scopeMode",
        "filterPrNumbers",
        "label-list:bug",
        "author-list:alice",
        "alwaysShowInReview",
      ]);
    });
  });
});
