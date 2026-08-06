/** @jest-environment jsdom */

const {
  createPrAppliedSummaryHelpers,
} = require("./pr-applied-summary.helpers.js");

describe("pr applied summary helpers", () => {
  test("given baseline inputs, when building summary view model, then required filters and summary text are returned", () => {
    const { buildAppliedSummaryViewModel } = createPrAppliedSummaryHelpers();

    const model = buildAppliedSummaryViewModel({
      repoFilter: "org/repo-a",
      scopeLabel: "all stored rows",
      rowsCount: 8,
      lastRunUpdatedAt: "2026-07-17T08:00:00.000Z",
      scheduler: {
        intervalMinutes: 20,
        manualCooldownMinutes: 30,
        lastManualRunAt: "manual-stamp",
        lastAutoRunAt: "auto-stamp",
      },
    });

    expect(model.appliedFilters).toEqual([
      "repo=org/repo-a",
      "scope=all stored rows",
    ]);
    expect(model.schedulerSummary).toContain("Auto every 20m");
    expect(model.schedulerSummary).toContain("Manual cooldown 30m");
    expect(model.appliedSummaryText).toContain("Rows: 8");
    expect(model.appliedSummaryText).toContain(
      "Last run: 2026-07-17T08:00:00.000Z",
    );
    expect(model.filterChips).toEqual([
      "repo=org/repo-a",
      "scope=all stored rows",
      "rows=8",
      "last-run=2026-07-17T08:00:00.000Z",
    ]);
  });

  test("given optional filters enabled, when building summary view model, then optional filter chips are included in order", () => {
    const { buildAppliedSummaryViewModel } = createPrAppliedSummaryHelpers();

    const model = buildAppliedSummaryViewModel({
      repoFilter: "",
      scopeLabel: "needs attention rows",
      filterPrNumbersRaw: "101,102",
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "alice",
      assignedFilter: "bob",
      approverFilter: "carol",
      alwaysShowInReview: true,
      openModeFilter: "in-review",
      rowsCount: 2,
      lastRunUpdatedAt: "",
      scheduler: {},
    });

    expect(model.appliedFilters).toEqual([
      "repo=all repos",
      "scope=needs attention rows",
      "pr-numbers=101,102",
      "label=bug",
      "exclude-label=wip",
      "author=alice",
      "assigned=bob",
      "approver=carol",
      "always-show-in-review=on",
      "open=in-review",
    ]);
    expect(model.filterChips).toEqual([
      "repo=all repos",
      "scope=needs attention rows",
      "pr-numbers=101,102",
      "label=bug",
      "exclude-label=wip",
      "author=alice",
      "assigned=bob",
      "approver=carol",
      "always-show-in-review=on",
      "open=in-review",
      "rows=2",
      "last-run=-",
    ]);
  });

  test("given scheduler skip and error details, when building summary view model, then scheduler summary includes both diagnostics", () => {
    const { buildAppliedSummaryViewModel } = createPrAppliedSummaryHelpers();

    const model = buildAppliedSummaryViewModel({
      scopeLabel: "all stored rows",
      rowsCount: 0,
      scheduler: {
        lastAutoSkipReason: "window not elapsed",
        lastAutoError: "request timed out",
      },
    });

    expect(model.schedulerSummary).toContain(
      "Last auto skip: window not elapsed",
    );
    expect(model.schedulerSummary).toContain(
      "Last auto error: request timed out",
    );
    expect(model.appliedSummaryText).toContain("Rows: 0");
  });
});
