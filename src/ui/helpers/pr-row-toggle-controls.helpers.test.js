/** @jest-environment jsdom */

const {
  createPrRowToggleControlsHelpers,
} = require("./pr-row-toggle-controls.helpers.js");

describe("pr row toggle controls helpers", () => {
  test("given in-review enabled state, when creating in-review control, then checkbox metadata and label are rendered", () => {
    const helpers = createPrRowToggleControlsHelpers({
      isInReviewEnabled: () => true,
      isFlaggedEnabled: () => false,
      toggleInReviewForRow: async () => {},
      toggleFlaggedForRow: async () => {},
      documentRef: document,
    });

    const result = helpers.createInReviewControl({ prNumber: 7 }, {});
    const checkbox = result?.querySelector(".in-review-toggle");

    expect(result?.className).toBe("in-review-control");
    expect(result?.querySelector(".in-review-label")?.textContent).toBe("In Review");
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.getAttribute("aria-label")).toBe("In Review for PR #7");
    expect(checkbox?.title).toBe("In review is ON for this PR");
  });

  test("given in-review checkbox change, when toggled, then title and callback args use the new state", () => {
    const toggleCalls = [];
    const entry = { prNumber: 12 };
    const row = { number: 99 };
    const helpers = createPrRowToggleControlsHelpers({
      isInReviewEnabled: () => false,
      isFlaggedEnabled: () => false,
      toggleInReviewForRow: async (...args) => toggleCalls.push(args),
      toggleFlaggedForRow: async () => {},
      documentRef: document,
    });

    const result = helpers.createInReviewControl(entry, row);
    const checkbox = result?.querySelector(".in-review-toggle");

    checkbox.checked = true;
    checkbox.onchange();

    expect(checkbox.title).toBe("In review is ON for this PR");
    expect(toggleCalls).toHaveLength(1);
    expect(toggleCalls[0][0]).toBe(entry);
    expect(toggleCalls[0][1]).toBe(row);
    expect(toggleCalls[0][2]).toBe(true);
    expect(toggleCalls[0][3]).toBe(checkbox);
  });

  test("given flagged enabled state and checkbox change, when creating and toggling flagged control, then title and callback args are updated", () => {
    const toggleCalls = [];
    const entry = { prNumber: 88 };
    const row = { number: 17 };
    const helpers = createPrRowToggleControlsHelpers({
      isInReviewEnabled: () => false,
      isFlaggedEnabled: () => true,
      toggleInReviewForRow: async () => {},
      toggleFlaggedForRow: async (...args) => toggleCalls.push(args),
      documentRef: document,
    });

    const result = helpers.createFlaggedControl(entry, row);
    const checkbox = result?.querySelector(".in-review-toggle.flagged-toggle");

    expect(result?.className).toBe("in-review-control flagged-control");
    expect(result?.querySelector(".flagged-label")?.textContent).toBe("Flagged");
    expect(checkbox?.getAttribute("aria-label")).toBe("Flagged for PR #17");
    expect(checkbox?.title).toBe("Flagged is ON for this PR");

    checkbox.checked = false;
    checkbox.onchange();

    expect(checkbox.title).toBe("Flagged is OFF for this PR");
    expect(toggleCalls).toHaveLength(1);
    expect(toggleCalls[0][0]).toBe(entry);
    expect(toggleCalls[0][1]).toBe(row);
    expect(toggleCalls[0][2]).toBe(false);
    expect(toggleCalls[0][3]).toBe(checkbox);
  });
});
