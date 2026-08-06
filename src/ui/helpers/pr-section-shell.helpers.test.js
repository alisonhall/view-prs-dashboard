/** @jest-environment jsdom */

const {
  createPrSectionShellHelpers,
} = require("./pr-section-shell.helpers.js");

describe("pr section shell helpers", () => {
  test("given rows do not need attention, when building a section, then counts render without attention chip", () => {
    const buildSectionTable = jest.fn(() => document.createElement("table"));
    const { buildPrSection } = createPrSectionShellHelpers({
      getNeedsAttentionConfig: () => ({ mode: "all" }),
      countPendingThreadComments: () => 0,
      shouldShowNeedsAttention: () => false,
      buildSectionTable,
      documentRef: document,
    });

    const section = buildPrSection({
      title: "Open PRs",
      rows: [{ data: { number: 101 } }],
      dateHeader: "YOUR LAST ACTIVITY",
      dateResolver: () => "",
      sectionKey: "open",
      lastCheckedAt: "",
      actorsMapFromPayload: {},
      isOpen: true,
    });

    expect(section).not.toBeNull();
    expect(section.querySelector(".pr-group-section-title").textContent).toBe(
      "Open PRs",
    );
    expect(section.querySelector(".pr-group-section-count").textContent).toBe(
      "1",
    );
    expect(
      section.querySelector(".pr-group-section-attention-count"),
    ).toBeNull();
    expect(buildSectionTable).toHaveBeenCalledWith(
      [{ data: { number: 101 } }],
      "YOUR LAST ACTIVITY",
      expect.any(Function),
      "open",
      "",
      {},
    );
  });

  test("given rows need attention, when building a section, then attention chip renders total attention count", () => {
    const shouldShowNeedsAttention = jest.fn(({ hasPendingComments }) =>
      Boolean(hasPendingComments),
    );
    const { buildPrSection } = createPrSectionShellHelpers({
      getNeedsAttentionConfig: () => ({ mode: "all" }),
      countPendingThreadComments: (row) => (row.number === 101 ? 2 : 0),
      shouldShowNeedsAttention,
      buildSectionTable: () => document.createElement("table"),
      documentRef: document,
    });

    const section = buildPrSection({
      title: "Open PRs",
      rows: [{ data: { number: 101 } }, { data: { number: 102 } }],
      dateHeader: "YOUR LAST ACTIVITY",
      dateResolver: () => "",
      sectionKey: "open",
      isOpen: true,
    });

    const attentionChip = section.querySelector(".pr-group-section-attention-count");
    expect(attentionChip).not.toBeNull();
    expect(attentionChip.textContent).toBe("Attention: 1");
    expect(shouldShowNeedsAttention).toHaveBeenCalledTimes(2);
  });

  test("given section is collapsed, when building a section, then details shell metadata is preserved", () => {
    const { buildPrSection } = createPrSectionShellHelpers({
      buildSectionTable: () => document.createElement("table"),
      documentRef: document,
    });

    const section = buildPrSection({
      title: "Closed PRs",
      rows: [],
      dateHeader: "CLOSED AT",
      dateResolver: () => "",
      sectionKey: "closed",
      isOpen: false,
    });

    expect(section.open).toBe(false);
    expect(section.getAttribute("data-pr-section")).toBe("closed");
    expect(section.className).toContain("pr-group-section-closed");
  });
});
