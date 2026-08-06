/** @jest-environment jsdom */

const {
  createPrActionsCellHelpers,
} = require("./pr-actions-cell.helpers.js");

describe("pr actions cell helpers", () => {
  test("given a row and entry, when creating actions cell, then action buttons and details aria-label are rendered", () => {
    const inReviewControl = document.createElement("span");
    inReviewControl.className = "in-review-control";
    const flaggedControl = document.createElement("span");
    flaggedControl.className = "flagged-control";

    const helpers = createPrActionsCellHelpers({
      createInReviewControl: () => inReviewControl,
      createFlaggedControl: () => flaggedControl,
      runSinglePrUpdate: async () => {},
      runAckOnlyWorkflow: async () => {},
      runClearOnlyWorkflow: async () => {},
      openPrJsonModal: () => {},
      getLatestSelectedRepo: () => "",
      defaultRepo: "org/default",
      documentRef: document,
    });

    const result = helpers.createActionsCell({ repo: "org/repo" }, { number: 55 });

    expect(result?.querySelector(".in-review-control")).toBeTruthy();
    expect(result?.querySelector(".flagged-control")).toBeTruthy();
    expect(result?.querySelector(".row-action-btn.update")?.textContent).toBe("↻ Update");
    expect(result?.querySelector(".row-action-btn.ack")?.textContent).toBe("✓ Ack");
    expect(result?.querySelector(".row-action-btn.clear")?.textContent).toBe("✕ Clear");
    expect(result?.querySelector(".row-action-btn.view-json")?.getAttribute("aria-label")).toBe(
      "View PR JSON details for #55",
    );
  });

  test("given action handlers, when clicking action buttons, then update and workflow callbacks receive expected args", async () => {
    const calls = {
      update: [],
      ack: [],
      clear: [],
      details: [],
    };

    const helpers = createPrActionsCellHelpers({
      createInReviewControl: () => document.createElement("span"),
      createFlaggedControl: () => document.createElement("span"),
      runSinglePrUpdate: async (entry, row) => calls.update.push([entry, row]),
      runAckOnlyWorkflow: async (prNumber, repo) => calls.ack.push([prNumber, repo]),
      runClearOnlyWorkflow: async (prNumber, repo) => calls.clear.push([prNumber, repo]),
      openPrJsonModal: (entry, row) => calls.details.push([entry, row]),
      getLatestSelectedRepo: () => "org/selected",
      defaultRepo: "org/default",
      documentRef: document,
    });

    const entry = { prNumber: 42 };
    const row = { number: 101 };
    const result = helpers.createActionsCell(entry, row);

    await result?.querySelector(".row-action-btn.update")?.onclick();
    await result?.querySelector(".row-action-btn.ack")?.onclick();
    await result?.querySelector(".row-action-btn.clear")?.onclick();
    result?.querySelector(".row-action-btn.view-json")?.onclick();

    expect(calls.update).toEqual([[entry, row]]);
    expect(calls.ack).toEqual([["101", "org/selected"]]);
    expect(calls.clear).toEqual([["101", "org/selected"]]);
    expect(calls.details).toEqual([[entry, row]]);
  });

  test("given an entry repo, when clicking ack and clear, then entry repo is preferred over selected and default repos", async () => {
    const calls = {
      ack: [],
      clear: [],
    };

    const helpers = createPrActionsCellHelpers({
      createInReviewControl: () => document.createElement("span"),
      createFlaggedControl: () => document.createElement("span"),
      runSinglePrUpdate: async () => {},
      runAckOnlyWorkflow: async (prNumber, repo) => calls.ack.push([prNumber, repo]),
      runClearOnlyWorkflow: async (prNumber, repo) => calls.clear.push([prNumber, repo]),
      openPrJsonModal: () => {},
      getLatestSelectedRepo: () => "org/selected",
      defaultRepo: "org/default",
      documentRef: document,
    });

    const result = helpers.createActionsCell({ repo: "org/entry", prNumber: 7 }, {});

    await result?.querySelector(".row-action-btn.ack")?.onclick();
    await result?.querySelector(".row-action-btn.clear")?.onclick();

    expect(calls.ack).toEqual([["7", "org/entry"]]);
    expect(calls.clear).toEqual([["7", "org/entry"]]);
  });
});
