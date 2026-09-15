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

  test("given an assignee who is also a requested reviewer, when creating approved cell, then that badge gets the -reviewer class and title suffix", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [{ login: "alice", name: "Alice" }],
      collectRequestedReviewers: () => [{ login: "alice", name: "Alice" }],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login, _actorsMap, fallbackName) =>
        String(fallbackName || login || ""),
      getUserInitials: (displayName) => String(displayName || "").slice(0, 2).toUpperCase(),
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "-", approvalCount: "0" }, {});

    const badge = result?.querySelector(".approved-assigned-badge");
    expect(String(badge?.className || "")).toContain("approved-assigned-badge-reviewer");
    expect(String(badge?.className || "")).not.toContain("approved-assigned-badge-reviewer-only");
    expect(badge?.title).toBe("Alice (reviewer)");
  });

  test("given an assignee who is not a requested reviewer, when creating approved cell, then the badge omits the -reviewer class", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [{ login: "alice", name: "Alice" }],
      collectRequestedReviewers: () => [{ login: "someone-else", name: "Someone Else" }],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login, _actorsMap, fallbackName) =>
        String(fallbackName || login || ""),
      getUserInitials: (displayName) => String(displayName || "").slice(0, 2).toUpperCase(),
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "-", approvalCount: "0" }, {});

    const badge = result?.querySelector(".approved-assigned-badge");
    expect(String(badge?.className || "")).not.toContain("approved-assigned-badge-reviewer");
    expect(badge?.title).toBe("Alice");
  });

  test("given a requested reviewer who is not assigned, when creating approved cell, then a badge still shows for them with the -reviewer class", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [],
      collectRequestedReviewers: () => [{ login: "reviewer-only", name: "Reviewer Only" }],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login, _actorsMap, fallbackName) =>
        String(fallbackName || login || ""),
      getUserInitials: (displayName) => String(displayName || "").slice(0, 2).toUpperCase(),
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "-", approvalCount: "0" }, {});

    const badge = result?.querySelector(".approved-assigned-badge");
    expect(badge).not.toBeNull();
    expect(String(badge?.className || "")).toContain("approved-assigned-badge-reviewer");
    expect(String(badge?.className || "")).toContain("approved-assigned-badge-reviewer-only");
    expect(badge?.title).toBe("Reviewer Only (reviewer) (not assigned)");
  });

  test("given assignees and a separate non-assigned reviewer, when creating approved cell, then both badges are shown", () => {
    const helpers = createPrApprovedCellHelpers({
      approvedClass: () => "",
      collectAssignedUsers: () => [{ login: "assignee-only", name: "Assignee Only" }],
      collectRequestedReviewers: () => [{ login: "reviewer-only", name: "Reviewer Only" }],
      getCurrentViewerLogin: () => "",
      resolveActorDisplayName: (login, _actorsMap, fallbackName) =>
        String(fallbackName || login || ""),
      getUserInitials: (displayName) => String(displayName || "").slice(0, 2).toUpperCase(),
      getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }),
      toCount: (value) => Number.parseInt(String(value ?? "0"), 10) || 0,
      documentRef: document,
    });

    const result = helpers.createApprovedCell({ approved: "-", approvalCount: "0" }, {});

    const badges = Array.from(result?.querySelectorAll(".approved-assigned-badge") || []);
    expect(badges).toHaveLength(2);
    expect(String(badges[0]?.className || "")).not.toContain("approved-assigned-badge-reviewer");
    expect(String(badges[1]?.className || "")).toContain("approved-assigned-badge-reviewer");
    expect(String(badges[0]?.className || "")).not.toContain("approved-assigned-badge-reviewer-only");
    expect(String(badges[1]?.className || "")).toContain("approved-assigned-badge-reviewer-only");
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
