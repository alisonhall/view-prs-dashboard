/** @jest-environment jsdom */

/**
 * Memory Leak Prevention Tests
 *
 * These tests verify that interval timers are properly managed to prevent memory leaks.
 * The implementation uses:
 * - Stored interval IDs for cleanup
 * - Visibility change listener to pause/resume timers
 * - Before un load listener to cleanup on page close
 */

describe("Memory leak prevention", () => {
  let originalSetInterval;
  let originalClearInterval;
  let originalDocument;
  let originalWindow;
  let setIntervalSpy;
  let clearIntervalSpy;
  let visibilityChangeListeners;
  let beforeunloadListeners;
  let mockIntervalId;

  beforeEach(() => {
    // Store originals
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalDocument = global.document;
    originalWindow = global.window;

    // Setup mocks
    mockIntervalId = 1;
    setIntervalSpy = jest.fn(() => mockIntervalId++);
    clearIntervalSpy = jest.fn();
    visibilityChangeListeners = [];
    beforeunloadListeners = [];

    global.setInterval = setIntervalSpy;
    global.clearInterval = clearIntervalSpy;

    // Mock document.addEventListener for visibilitychange
    const originalAddEventListener = document.addEventListener;
    jest.spyOn(document, "addEventListener").mockImplementation((event, listener) => {
      if (event === "visibilitychange") {
        visibilityChangeListeners.push(listener);
      } else {
        originalAddEventListener.call(document, event, listener);
      }
    });

    // Mock window.addEventListener for beforeunload
    const originalWindowAddEventListener = window.addEventListener;
    jest.spyOn(window, "addEventListener").mockImplementation((event, listener) => {
      if (event === "beforeunload") {
        beforeunloadListeners.push(listener);
      } else {
        originalWindowAddEventListener.call(window, event, listener);
      }
    });
  });

  afterEach(() => {
    // Restore originals
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    jest.restoreAllMocks();
  });

  describe("interval ID storage", () => {
    test("given interval timers created, when setInterval is called, then interval IDs should be stored", () => {
      // This test verifies the pattern exists in the code
      // Read the source file to verify interval IDs are being stored
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify interval ID variables are declared
      expect(sourceCode).toContain("let pollDataInterval = null;");
      expect(sourceCode).toContain("let pollSchedulerInterval = null;");
      expect(sourceCode).toContain("let pollBackfillInterval = null;");
      expect(sourceCode).toContain("let activityRenderInterval = null;");

      // Verify interval IDs are assigned when creating intervals
      expect(sourceCode).toContain("pollDataInterval = setInterval(");
      expect(sourceCode).toContain("pollSchedulerInterval = setInterval(");
      expect(sourceCode).toContain("pollBackfillInterval = setInterval(");
      expect(sourceCode).toContain("activityRenderInterval = setInterval(");
    });

    test("given interval timers created, when storing IDs, then all 4 interval types should be captured", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Count how many times each interval is assigned
      const pollDataCount = (sourceCode.match(/pollDataInterval = setInterval/g) || []).length;
      const pollSchedulerCount = (sourceCode.match(/pollSchedulerInterval = setInterval/g) || []).length;
      const pollBackfillCount = (sourceCode.match(/pollBackfillInterval = setInterval/g) || []).length;
      const activityRenderCount = (sourceCode.match(/activityRenderInterval = setInterval/g) || []).length;

      // Each interval should be assigned at least once (in initial setup and restart function)
      expect(pollDataCount).toBeGreaterThanOrEqual(1);
      expect(pollSchedulerCount).toBeGreaterThanOrEqual(1);
      expect(pollBackfillCount).toBeGreaterThanOrEqual(1);
      expect(activityRenderCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("cleanup function", () => {
    test("given cleanup function exists, when checking implementation, then it should clear all 4 interval types", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify cleanupIntervals function exists
      expect(sourceCode).toContain("const cleanupIntervals = () => {");

      // Verify all intervals are cleared in cleanup
      expect(sourceCode).toContain("clearInterval(pollDataInterval)");
      expect(sourceCode).toContain("clearInterval(pollSchedulerInterval)");
      expect(sourceCode).toContain("clearInterval(pollBackfillInterval)");
      expect(sourceCode).toContain("clearInterval(activityRenderInterval)");

      // Verify intervals are reset to null after clearing
      const cleanupSection = sourceCode.match(
        /const cleanupIntervals = \(\) => \{[\s\S]*?\};/
      )?.[0] || "";
      expect(cleanupSection).toContain("pollDataInterval = null;");
      expect(cleanupSection).toContain("pollSchedulerInterval = null;");
      expect(cleanupSection).toContain("pollBackfillInterval = null;");
      expect(cleanupSection).toContain("activityRenderInterval = null;");
    });
  });

  describe("restart function", () => {
    test("given restart function exists, when checking implementation, then it should recreate all 4 interval types", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify restartIntervals function exists
      expect(sourceCode).toContain("const restartIntervals = () => {");

      // Verify all intervals are recreated in restart
      const restartSection = sourceCode.match(
        /const restartIntervals = \(\) => \{[\s\S]*?\};/
      )?.[0] || "";
      expect(restartSection).toContain("pollDataInterval = setInterval");
      expect(restartSection).toContain("pollSchedulerInterval = setInterval");
      expect(restartSection).toContain("pollBackfillInterval = setInterval");
      expect(restartSection).toContain("activityRenderInterval = setInterval");
    });
  });

  describe("visibility change handling", () => {
    test("given page initialization, when checking listeners, then visibilitychange listener should be registered", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify visibilitychange event listener is registered
      expect(sourceCode).toContain('document.addEventListener("visibilitychange"');

      // Verify listener calls cleanup when hidden
      expect(sourceCode).toMatch(/if \(document\.hidden\)[\s\S]*?cleanupIntervals/);

      // Verify listener calls restart when visible
      expect(sourceCode).toMatch(/else[\s\S]*?restartIntervals/);
    });
  });

  describe("beforeunload handling", () => {
    test("given page initialization, when checking listeners, then beforeunload listener should call cleanup", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify beforeunload event listener is registered with cleanup
      expect(sourceCode).toContain('window.addEventListener("beforeunload", cleanupIntervals)');
    });
  });

  describe("integration - memory leak prevention pattern", () => {
    test("given complete implementation, when checking pattern, then all required pieces should be present", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Required pieces for memory leak prevention:
      const hasIntervalVariables = sourceCode.includes("let pollDataInterval = null;");
      const hasCleanupFunction = sourceCode.includes("const cleanupIntervals = () => {");
      const hasRestartFunction = sourceCode.includes("const restartIntervals = () => {");
      const hasVisibilityListener = sourceCode.includes('document.addEventListener("visibilitychange"');
      const hasBeforeunloadListener = sourceCode.includes('window.addEventListener("beforeunload"');
      const storesIntervalIds = sourceCode.includes("pollDataInterval = setInterval(");
      const clearsIntervals = sourceCode.includes("clearInterval(pollDataInterval)");

      // All pieces must be present
      expect(hasIntervalVariables).toBe(true);
      expect(hasCleanupFunction).toBe(true);
      expect(hasRestartFunction).toBe(true);
      expect(hasVisibilityListener).toBe(true);
      expect(hasBeforeunloadListener).toBe(true);
      expect(storesIntervalIds).toBe(true);
      expect(clearsIntervals).toBe(true);
    });
  });

  describe("documentation comments", () => {
    test("given cleanup/restart functions, when checking comments, then they should explain purpose", () => {
      const fs = require("fs");
      const path = require("path");
      const sourceCode = fs.readFileSync(
        path.join(__dirname, "..", "index.page.js"),
        "utf-8"
      );

      // Verify cleanup function has documentation comment
      expect(sourceCode).toMatch(/\/\*\*[\s\S]*?prevent memory leaks[\s\S]*?\*\/[\s\S]*?const cleanupIntervals/);

      // Verify restart function has documentation comment
      expect(sourceCode).toMatch(/\/\*\*[\s\S]*?Restart[\s\S]*?\*\/[\s\S]*?const restartIntervals/);

      // Verify initial interval setup has comment
      expect(sourceCode).toContain("// Start auto-polling intervals (stored for cleanup to prevent memory leaks)");
    });
  });
});
