// Regression test for a real footgun found during review: VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET
// (app-config.js) only floors at 1, with no relationship enforced against
// the dispatcher's own per-task-type gh-process costs (4, for autoRefresh/
// mergedDrain - see app.js's dispatcherGhCostByTaskType). Set the budget
// below that cost and pickNextBatch would never select those task types
// again - silent, permanent starvation, with nothing surfacing why
// background refresh/drain just stopped. app.js clamps the *effective*
// budget up to the minimum viable value and warns when it does, rather
// than just documenting the risk.
//
// VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET must be set before app.js is first
// required, since it's read once at module load - hence the isolated file
// and jest.resetModules(), matching the precedent in
// app.insights-hook-script.test.js.
describe("dispatcher gh-process budget clamp (prevents silent task-type starvation)", () => {
  let originalEnvValue;
  let consoleWarnSpy;

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET;
    } else {
      process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET = originalEnvValue;
    }
    consoleWarnSpy?.mockRestore();
  });

  test("a budget below the highest per-task-type cost is clamped up, with a warning", () => {
    originalEnvValue = process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET;
    process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET = "2";
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    jest.resetModules();
    require("../app.js");

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET=2"),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("never be scheduled"));
  });

  test("a budget already at or above the highest per-task-type cost is left alone, no warning", () => {
    originalEnvValue = process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET;
    process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET = "8";
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    jest.resetModules();
    require("../app.js");

    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET"),
    );
  });
});
