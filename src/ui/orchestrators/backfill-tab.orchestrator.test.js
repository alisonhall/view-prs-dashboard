const {
  createBackfillTabOrchestrator,
} = require("./backfill-tab.orchestrator.js");

describe("Backfill Tab Orchestrator", () => {
  let mockDeps;
  let orchestrator;

  beforeEach(() => {
    // Create mock dependencies
    mockDeps = {
      loadBackfillStatus: jest.fn().mockResolvedValue(undefined),
      loadBackfillLogTail: jest.fn().mockResolvedValue(undefined),
      renderBackfillStatus: jest.fn(),
      setBackfillLogMessage: jest.fn(),
      getOptionalElementById: jest.fn(),
      notifyFailureSnackbar: jest.fn(),
      stateGetters: {
        getLastBackfillStateKey: jest.fn(() => ""),
      },
      stateSetters: {
        setLastBackfillStateKey: jest.fn(),
      },
    };

    // Create orchestrator instance
    orchestrator = createBackfillTabOrchestrator(mockDeps);
  });

  describe("Given orchestrator is created", () => {
    // Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // loadStatus/handleAction/refreshStatus used to also be public here -
    // found to have zero real callers (the vanilla button click handlers
    // always called loadBackfillStatus/handleBackfillAction/
    // loadBackfillLogTail directly), so they're no longer part of the
    // public API. loadStatus stays as an internal implementation detail,
    // exercised below via initialize/onTabActivated instead of calling it
    // directly.
    test("When checking API, Then all methods are defined", () => {
      expect(orchestrator.initialize).toBeDefined();
      expect(orchestrator.onTabActivated).toBeDefined();
      expect(orchestrator.cleanup).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.onTabActivated).toBe("function");
      expect(typeof orchestrator.cleanup).toBe("function");
    });
  });

  describe("Given orchestrator initialization", () => {
    test("When initialize called, Then loadBackfillStatus is called", async () => {
      // Act
      orchestrator.initialize();
      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledWith({ includeLog: true });
    });

    test("When initialize called twice, Then no duplicate calls", async () => {
      // Act
      orchestrator.initialize();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const callCount = mockDeps.loadBackfillStatus.mock.calls.length;

      orchestrator.initialize();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert - no additional calls
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledTimes(callCount);
    });
  });

  describe("Given tab activation", () => {
    beforeEach(() => {
      orchestrator.initialize();
    });

    test("When onTabActivated called, Then loadStatus is triggered", async () => {
      // Arrange
      mockDeps.loadBackfillStatus.mockClear();

      // Act
      orchestrator.onTabActivated();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalled();
    });

    test("When onTabActivated's internal loadStatus fails, Then error is rendered", async () => {
      // Arrange
      const error = new Error("Network error");
      mockDeps.loadBackfillStatus.mockRejectedValueOnce(error);

      // Act
      orchestrator.onTabActivated();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockDeps.renderBackfillStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          running: false,
        })
      );
      expect(mockDeps.notifyFailureSnackbar).toHaveBeenCalled();
    });

    test("When not initialized and onTabActivated called, Then no action", async () => {
      // Arrange
      orchestrator.cleanup();
      mockDeps.loadBackfillStatus.mockClear();

      // Act
      orchestrator.onTabActivated();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockDeps.loadBackfillStatus).not.toHaveBeenCalled();
    });
  });

  describe("Given cleanup", () => {
    test("When cleanup called, Then orchestrator marked as uninitialized", async () => {
      // Arrange
      orchestrator.initialize();
      await new Promise((resolve) => setTimeout(resolve, 0));
      mockDeps.loadBackfillStatus.mockClear();

      // Act
      orchestrator.cleanup();

      // Assert - verify the internal loadStatus doesn't run after cleanup
      orchestrator.onTabActivated();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockDeps.loadBackfillStatus).not.toHaveBeenCalled();
    });
  });
});
