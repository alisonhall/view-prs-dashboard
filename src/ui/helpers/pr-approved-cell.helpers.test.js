/** @jest-environment jsdom */

const {
  createPrApprovedCellHelpers,
} = require("./pr-approved-cell.helpers.js");

describe("pr approved cell helpers", () => {
  test("given approved status with assignees including viewer, when creating approved cell, then summary badges and viewer marker are rendered", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "approved-yes",
      collectAssignedUsers: () => [
        { login: "alice", name: "Alice" },
        { login: "viewer", name: "Viewer Name" },
      ],
      getCurrentViewerLogin: () => "viewer",
      resolveActorDisplayName: (login, _actorsMap, fallbackName) =>
        String(fallbackName || login || ""),
      getUserInitials: (displayName) => String(displayName || "").slice(0, 2).toUpperCase(),
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "YES", approvalCount: "2" }, {});

    expect(result?.className).toContain("approved-cell");
    expect(result?.className).toContain("approved-yes");
    expect(result?.querySelector(".approved-cell-summary")?.textContent).toBe("YES (2)");
    const badges = Array.from(result?.querySelectorAll(".approved-assigned-badge") || []);
    expect(badges).toHaveLength(2);
    expect(String(badges[1]?.className || "")).toContain("approved-assigned-badge-me");
    expect(badges[1]?.title).toBe("Viewer Name (you)");
  });

  test("given open conversations with viewer scope, when creating approved cell, then conversation detail line includes viewer suffix", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login) => String(login || ""),
      getUserInitials: () => "",
      getOpenConversationCountWithMe: () => ({ count: 1, isViewerSpecific: true }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "NO", approvalCount: "0" }, {});

    expect(result?.querySelector(".approved-open-conversations")?.textContent).toBe(
      "1 open conversation with me",
    );
  });

  test("given no assignees and zero open conversations, when creating approved cell, then only the summary is rendered", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login) => String(login || ""),
      getUserInitials: () => "",
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "-", approvalCount: "0" }, {});

    expect(result?.querySelector(".approved-cell-summary")?.textContent).toBe("- (0)");
    expect(result?.querySelector(".approved-assigned-badges")).toBeNull();
    expect(result?.querySelector(".approved-open-conversations")).toBeNull();
  });
});
