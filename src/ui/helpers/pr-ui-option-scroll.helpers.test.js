const {
  createPrUiOptionScrollHelpers,
} = require("./pr-ui-option-scroll.helpers.js");

describe("pr ui option scroll helpers", () => {
  test("given scope mode input, when registering persistence handlers and firing change, then scope-mode override persistence is requested", async () => {
    const changeListeners = [];
    const scopeMode = {
      addEventListener: (_eventName, handler) => {
        changeListeners.push(handler);
      },
    };
    const persisted = [];

    const { registerUiOptionPersistenceHandlers } =
      createPrUiOptionScrollHelpers({
        getOptionalElementById: (id) => (id === "scope-mode" ? scopeMode : null),
        persistUiOptionOverrides: async (keys) => {
          persisted.push(keys);
        },
      });

    registerUiOptionPersistenceHandlers();
    await changeListeners[0]();

    expect(persisted).toEqual([["scope-mode"]]);
  });

  test("given auto-scroll toggle and backfill state, when checking shouldAutoScrollBackfillLog, then helper delegates to state rule inputs", () => {
    const calls = [];

    const { shouldAutoScrollBackfillLog } = createPrUiOptionScrollHelpers({
      getOptionalElementById: (id) =>
        id === "backfill-log-autoscroll" ? { checked: true } : null,
      shouldAutoScrollBackfillLogByState: (input) => {
        calls.push(input);
        return true;
      },
      getIsBackfillRunning: () => true,
    });

    expect(shouldAutoScrollBackfillLog()).toBe(true);
    expect(calls).toEqual([
      {
        autoScrollEnabled: true,
        isBackfillRunning: true,
      },
    ]);
  });

  test("given log element and active auto-scroll, when autoScrollBackfillLogToBottom runs, then scrollTop is set from computed value", () => {
    const node = {
      scrollHeight: 500,
      scrollTop: 25,
    };

    const { autoScrollBackfillLogToBottom } = createPrUiOptionScrollHelpers({
      getOptionalElementById: (id) => {
        if (id === "backfill-log") return node;
        if (id === "backfill-log-autoscroll") return { checked: true };
        return null;
      },
      shouldAutoScrollBackfillLogByState: () => true,
      getBackfillScrollTop: () => 500,
      getIsBackfillRunning: () => true,
    });

    autoScrollBackfillLogToBottom();
    expect(node.scrollTop).toBe(500);
  });

  test("given missing log element, when autoScrollBackfillLogToBottom runs, then function exits without throwing", () => {
    const { autoScrollBackfillLogToBottom } = createPrUiOptionScrollHelpers({
      getOptionalElementById: () => null,
    });

    expect(() => autoScrollBackfillLogToBottom()).not.toThrow();
  });
});
