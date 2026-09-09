/** @jest-environment jsdom */

const {
  createPrSmartGroupManipulationHelpers,
} = require("./pr-smart-group-manipulation.helpers.js");

describe("smart group manipulation helpers", () => {
  let mockGetSmartGroupSection;
  let mockGetPrRowElement;
  let mockUpdateSectionCount;
  let mockEntryNeedsAttention;
  let mockHasUserInteraction;
  let helpers;

  beforeEach(() => {
    // Reset mocks
    mockGetSmartGroupSection = jest.fn();
    mockGetPrRowElement = jest.fn();
    mockUpdateSectionCount = jest.fn();
    mockEntryNeedsAttention = jest.fn(() => false);
    mockHasUserInteraction = jest.fn(() => false);

    helpers = createPrSmartGroupManipulationHelpers({
      getSmartGroupSection: mockGetSmartGroupSection,
      getPrRowElement: mockGetPrRowElement,
      updateSectionCount: mockUpdateSectionCount,
      entryNeedsAttention: mockEntryNeedsAttention,
      hasUserInteraction: mockHasUserInteraction,
    });
  });

  describe("addPrToSmartGroup", () => {
    test("given valid PR and group, when adding, then row is cloned and appended", () => {
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");
      prRow.innerHTML = "<td>PR #123</td>";

      const tbody = document.createElement("tbody");
      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetPrRowElement.mockReturnValue(prRow);
      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const result = helpers.addPrToSmartGroup("123", "flagged");

      expect(result).toBe(true);
      expect(tbody.children).toHaveLength(1);
      expect(tbody.children[0].getAttribute("data-pr-number")).toBe("123");
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("flagged", +1);
    });

    test("given PR already in group, when adding, then returns false and does not duplicate", () => {
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      const existingRow = document.createElement("tr");
      existingRow.setAttribute("data-pr-number", "123");

      const tbody = document.createElement("tbody");
      tbody.appendChild(existingRow);

      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetPrRowElement.mockReturnValue(prRow);
      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const result = helpers.addPrToSmartGroup("123", "flagged");

      expect(result).toBe(false);
      expect(tbody.children).toHaveLength(1); // Still only 1
      expect(mockUpdateSectionCount).not.toHaveBeenCalled();
    });

    test("given no PR row found, when adding, then returns false", () => {
      mockGetPrRowElement.mockReturnValue(null);
      mockGetSmartGroupSection.mockReturnValue(document.createElement("section"));

      const result = helpers.addPrToSmartGroup("123", "flagged");

      expect(result).toBe(false);
      expect(mockUpdateSectionCount).not.toHaveBeenCalled();
    });

    test("given no group section found, when adding, then returns false", () => {
      mockGetPrRowElement.mockReturnValue(document.createElement("tr"));
      mockGetSmartGroupSection.mockReturnValue(null);

      const result = helpers.addPrToSmartGroup("123", "flagged");

      expect(result).toBe(false);
      expect(mockUpdateSectionCount).not.toHaveBeenCalled();
    });
  });

  describe("removePrFromSmartGroup", () => {
    test("given PR in group, when removing, then row is removed and count updated", () => {
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      const tbody = document.createElement("tbody");
      tbody.appendChild(prRow);

      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const result = helpers.removePrFromSmartGroup("123", "flagged");

      expect(result).toBe(true);
      expect(tbody.children).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("flagged", -1);
    });

    test("given PR not in group, when removing, then returns false", () => {
      const tbody = document.createElement("tbody");
      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const result = helpers.removePrFromSmartGroup("123", "flagged");

      expect(result).toBe(false);
      expect(mockUpdateSectionCount).not.toHaveBeenCalled();
    });
  });

  describe("updateSmartGroupsForInReview", () => {
    test("given enabling in-review, when updating, then adds to in-review and needs-attention", () => {
      // Setup: PR row and both group sections exist
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      const createGroupSection = () => {
        const tbody = document.createElement("tbody");
        const section = document.createElement("section");
        section.appendChild(tbody);
        return section;
      };

      mockGetPrRowElement.mockReturnValue(prRow);
      mockGetSmartGroupSection.mockImplementation((groupKey) => {
        if (groupKey === "in-review" || groupKey === "needs-attention") {
          return createGroupSection();
        }
        return null;
      });

      const entry = { data: { number: 123 }, section: "open" };
      const changes = helpers.updateSmartGroupsForInReview("123", true, entry, {});

      expect(changes.added).toContain("in-review");
      expect(changes.added).toContain("needs-attention");
      expect(changes.removed).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("in-review", +1);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("needs-attention", +1);
    });

    test("given disabling in-review with no other attention reasons, when updating, then removes from both groups", () => {
      // Setup: PR exists in both groups
      const createGroupSectionWithPr = () => {
        const prRow = document.createElement("tr");
        prRow.setAttribute("data-pr-number", "123");
        const tbody = document.createElement("tbody");
        tbody.appendChild(prRow);
        const section = document.createElement("section");
        section.appendChild(tbody);
        return section;
      };

      mockGetSmartGroupSection.mockImplementation((groupKey) => {
        if (groupKey === "in-review" || groupKey === "needs-attention") {
          return createGroupSectionWithPr();
        }
        return null;
      });

      mockEntryNeedsAttention.mockReturnValue(false); // No other reasons

      const entry = { data: { number: 123 }, section: "open" };
      const changes = helpers.updateSmartGroupsForInReview("123", false, entry, {});

      expect(changes.removed).toContain("in-review");
      expect(changes.removed).toContain("needs-attention");
      expect(changes.added).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("in-review", -1);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("needs-attention", -1);
    });

    test("given disabling in-review with other attention reasons, when updating, then keeps in needs-attention", () => {
      // Setup: PR exists in both groups
      const inReviewSection = document.createElement("section");
      const inReviewTbody = document.createElement("tbody");
      const inReviewRow = document.createElement("tr");
      inReviewRow.setAttribute("data-pr-number", "123");
      inReviewTbody.appendChild(inReviewRow);
      inReviewSection.appendChild(inReviewTbody);

      const needsAttentionSection = document.createElement("section");
      const needsAttentionTbody = document.createElement("tbody");
      const needsAttentionRow = document.createElement("tr");
      needsAttentionRow.setAttribute("data-pr-number", "123");
      needsAttentionTbody.appendChild(needsAttentionRow);
      needsAttentionSection.appendChild(needsAttentionTbody);

      mockGetSmartGroupSection.mockImplementation((groupKey) => {
        if (groupKey === "in-review") return inReviewSection;
        if (groupKey === "needs-attention") return needsAttentionSection;
        return null;
      });

      mockEntryNeedsAttention.mockReturnValue(true); // Has other reasons (e.g., CHANGED status)

      const entry = { data: { number: 123, status: "CHANGED" }, section: "open" };
      const changes = helpers.updateSmartGroupsForInReview("123", false, entry, {});

      expect(changes.removed).toContain("in-review");
      expect(changes.removed).not.toContain("needs-attention"); // NOT removed!
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("in-review", -1);
      expect(mockUpdateSectionCount).not.toHaveBeenCalledWith("needs-attention", -1);
    });
  });

  describe("updateSmartGroupsForFlagged", () => {
    test("given enabling flagged, when updating, then adds to flagged group", () => {
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      const tbody = document.createElement("tbody");
      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetPrRowElement.mockReturnValue(prRow);
      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const changes = helpers.updateSmartGroupsForFlagged("123", true);

      expect(changes.added).toContain("flagged");
      expect(changes.removed).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("flagged", +1);
    });

    test("given disabling flagged, when updating, then removes from flagged group", () => {
      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      const tbody = document.createElement("tbody");
      tbody.appendChild(prRow);

      const groupSection = document.createElement("section");
      groupSection.appendChild(tbody);

      mockGetSmartGroupSection.mockReturnValue(groupSection);

      const changes = helpers.updateSmartGroupsForFlagged("123", false);

      expect(changes.removed).toContain("flagged");
      expect(changes.added).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("flagged", -1);
    });
  });

  describe("revertSmartGroupChanges", () => {
    test("given changes object, when reverting, then undoes all additions and removals", () => {
      // Setup: Create sections
      const createSection = () => {
        const tbody = document.createElement("tbody");
        const section = document.createElement("section");
        section.appendChild(tbody);
        return section;
      };

      const flaggedSection = createSection();
      const inReviewSection = createSection();

      // Mock: flagged section has a PR that was added
      const flaggedRow = document.createElement("tr");
      flaggedRow.setAttribute("data-pr-number", "123");
      flaggedSection.querySelector("tbody").appendChild(flaggedRow);

      const prRow = document.createElement("tr");
      prRow.setAttribute("data-pr-number", "123");

      mockGetPrRowElement.mockReturnValue(prRow);
      mockGetSmartGroupSection.mockImplementation((groupKey) => {
        if (groupKey === "flagged") return flaggedSection;
        if (groupKey === "in-review") return inReviewSection;
        return null;
      });

      const changes = {
        added: ["flagged"],
        removed: ["in-review"],
      };

      helpers.revertSmartGroupChanges("123", changes);

      // Verify: flagged was removed (undo add)
      expect(flaggedSection.querySelector("tbody").children).toHaveLength(0);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("flagged", -1);

      // Verify: in-review was added back (undo remove)
      expect(inReviewSection.querySelector("tbody").children).toHaveLength(1);
      expect(mockUpdateSectionCount).toHaveBeenCalledWith("in-review", +1);
    });
  });
});
