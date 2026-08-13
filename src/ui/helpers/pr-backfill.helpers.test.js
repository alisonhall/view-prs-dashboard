const { createPrBackfillHelpers } = require("../helpers/pr-backfill.helpers.js");

describe("pr backfill helpers", () => {
  const {
    getBackfillStateKey,
    shouldAutoScrollBackfillLog,
    getBackfillScrollTop,
    getBackfillStatusViewModel,
    formatBackfillLogMessage,
  } = createPrBackfillHelpers();

  test("getBackfillStateKey is stable for equivalent inputs", () => {
    const left = getBackfillStateKey({
      running: true,
      pid: 321,
      summary: "Running",
      error: "",
    });
    const right = getBackfillStateKey({
      running: true,
      pid: 321,
      summary: "Running",
      error: "",
      ignored: "value",
    });

    expect(left).toBe(right);
  });

  test("shouldAutoScrollBackfillLog requires toggle and running state", () => {
    expect(
      shouldAutoScrollBackfillLog({
        autoScrollEnabled: true,
        isBackfillRunning: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoScrollBackfillLog({
        autoScrollEnabled: true,
        isBackfillRunning: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoScrollBackfillLog({
        autoScrollEnabled: false,
        isBackfillRunning: true,
      }),
    ).toBe(false);
  });

  test("getBackfillScrollTop respects auto-scroll and invalid heights", () => {
    expect(
      getBackfillScrollTop({
        scrollHeight: 900,
        currentScrollTop: 10,
        shouldAutoScroll: true,
      }),
    ).toBe(900);

    expect(
      getBackfillScrollTop({
        scrollHeight: "invalid",
        currentScrollTop: 55,
        shouldAutoScroll: true,
      }),
    ).toBe(55);

    expect(
      getBackfillScrollTop({
        scrollHeight: 900,
        currentScrollTop: 44,
        shouldAutoScroll: false,
      }),
    ).toBe(44);
  });

  test("getBackfillStatusViewModel maps status, badges, and button disabled state", () => {
    const runningVm = getBackfillStatusViewModel({
      backfillRaw: {
        running: true,
        ok: false,
        pid: 4321,
        summary: "Active",
        logFile: "/tmp/log",
        pidFile: "/tmp/pid",
        error: "tail unavailable",
      },
      isBackfillActionPending: false,
    });

    expect(runningVm.badges.map((entry) => entry.text)).toEqual([
      "Backfill: running",
      "Status error",
      "PID 4321",
    ]);
    expect(runningVm.detailsText).toContain("Summary: Active");
    expect(runningVm.detailsText).toContain("Error: tail unavailable");
    expect(runningVm.isBackfillRunning).toBe(true);
    expect(runningVm.buttonState).toEqual({
      startDisabled: true,
      stopDisabled: false,
      refreshDisabled: false,
      refreshLogDisabled: false,
    });

    const pendingVm = getBackfillStatusViewModel({
      backfillRaw: { running: false },
      isBackfillActionPending: true,
    });
    expect(pendingVm.buttonState).toEqual({
      startDisabled: true,
      stopDisabled: true,
      refreshDisabled: true,
      refreshLogDisabled: true,
    });
  });

  test("formatBackfillLogMessage handles explicit and fallback content", () => {
    expect(
      formatBackfillLogMessage({ summary: "Backfill summary", tail: "line1\nline2" }),
    ).toBe("Backfill summary\nline1\nline2");

    expect(formatBackfillLogMessage({ summary: "", tail: "" })).toBe(
      "Backfill log\n(no log lines yet)",
    );
  });
});
