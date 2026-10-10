const {
  createPrUiOptionScrollHelpers,
} = require("./pr-ui-option-scroll.helpers.js");

describe("pr ui option scroll helpers", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("given a scope-mode change event bubbling to the form, when registering persistence handlers, firing change, and letting the debounce elapse, then scope-mode override persistence is requested", async () => {
    // Delegated on the form (not attached to #scope-mode directly): that
    // field may be React-owned (see ScopeFilterSelect.jsx), and
    // ReactDOM.createRoot().render() creates a fresh DOM node on mount -
    // a listener attached directly to the pre-mount node would be
    // silently orphaned. The native "change" event still bubbles to the
    // form either way, which is what this test simulates.
    const changeListeners = [];
    const form = {
      addEventListener: (_eventName, handler) => {
        changeListeners.push(handler);
      },
    };
    const persisted = [];

    const { registerUiOptionPersistenceHandlers } =
      createPrUiOptionScrollHelpers({
        getOptionalElementById: (id) => (id === "run-script-form" ? form : null),
        persistUiOptionOverrides: async (keys) => {
          persisted.push(keys);
        },
      });

    registerUiOptionPersistenceHandlers();
    changeListeners[0]({ target: { id: "scope-mode" } });
    await jest.runAllTimersAsync();

    expect(persisted).toEqual([["scope-mode"]]);
  });

  test("given two scope-mode change events firing in rapid succession, when the debounce elapses, then only the trailing persist call is made", async () => {
    // Regression coverage for the CI-only intermittent e2e failure: two
    // overlapping GET-merge-PUT persist calls (persistUiOptionOverrides,
    // index.page.js) racing against the same user-defaults.json could lose
    // an update if the earlier PUT's write landed after the later one's.
    // Debouncing collapses rapid changes into a single trailing call.
    const changeListeners = [];
    const form = {
      addEventListener: (_eventName, handler) => {
        changeListeners.push(handler);
      },
    };
    const persisted = [];

    const { registerUiOptionPersistenceHandlers } =
      createPrUiOptionScrollHelpers({
        getOptionalElementById: (id) => (id === "run-script-form" ? form : null),
        persistUiOptionOverrides: async (keys) => {
          persisted.push(keys);
        },
      });

    registerUiOptionPersistenceHandlers();
    changeListeners[0]({ target: { id: "scope-mode" } });
    changeListeners[0]({ target: { id: "scope-mode" } });
    await jest.runAllTimersAsync();

    expect(persisted).toEqual([["scope-mode"]]);
  });

  test("given a change event for an unrelated field bubbling to the form, when firing change and letting the debounce elapse, then no persistence is requested", async () => {
    const changeListeners = [];
    const form = {
      addEventListener: (_eventName, handler) => {
        changeListeners.push(handler);
      },
    };
    const persisted = [];

    const { registerUiOptionPersistenceHandlers } =
      createPrUiOptionScrollHelpers({
        getOptionalElementById: (id) => (id === "run-script-form" ? form : null),
        persistUiOptionOverrides: async (keys) => {
          persisted.push(keys);
        },
      });

    registerUiOptionPersistenceHandlers();
    changeListeners[0]({ target: { id: "filter-pr-numbers" } });
    await jest.runAllTimersAsync();

    expect(persisted).toEqual([]);
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
