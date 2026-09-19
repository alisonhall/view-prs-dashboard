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
      handleBackfillAction: jest.fn().mockResolvedValue(undefined),
      renderBackfillStatus: jest.fn(),
      setBackfillLogMessage: jest.fn(),
      activateDataTab: jest.fn(),
      getOptionalElementById: jest.fn(),
      beginRequestActivity: jest.fn(() => jest.fn()), // Returns cleanup function
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
    test("When checking API, Then all methods are defined", () => {
      expect(orchestrator.initialize).toBeDefined();
      expect(orchestrator.loadStatus).toBeDefined();
      expect(orchestrator.handleAction).toBeDefined();
      expect(orchestrator.activateTab).toBeDefined();
      expect(orchestrator.refreshStatus).toBeDefined();
      expect(orchestrator.cleanup).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.loadStatus).toBe("function");
      expect(typeof orchestrator.handleAction).toBe("function");
      expect(typeof orchestrator.activateTab).toBe("function");
      expect(typeof orchestrator.refreshStatus).toBe("function");
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

    test("When activateTab called, Then activateDataTab helper called with backfill", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.activateDataTab).toHaveBeenCalledWith("backfill");
      expect(mockDeps.activateDataTab).toHaveBeenCalledTimes(1);
    });

    test("When activateTab called, Then loadStatus is triggered", async () => {
      // Arrange
      mockDeps.loadBackfillStatus.mockClear();

      // Act
      orchestrator.activateTab();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalled();
    });
  });

  describe("Given loading status", () => {
    beforeEach(() => {
      orchestrator.initialize();
      mockDeps.loadBackfillStatus.mockClear();
    });

    test("When loadStatus called, Then loadBackfillStatus helper called", async () => {
      // Act
      await orchestrator.loadStatus();

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalled();
    });

    test("When loadStatus called with options, Then options passed to helper", async () => {
      // Act
      await orchestrator.loadStatus({ announce: true, includeLog: true });

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledWith({
        announce: true,
        includeLog: true,
      });
    });

    test("When loadStatus fails, Then error is rendered", async () => {
      // Arrange
      const error = new Error("Network error");
      mockDeps.loadBackfillStatus.mockRejectedValueOnce(error);

      // Act
      await orchestrator.loadStatus();

      // Assert
      expect(mockDeps.renderBackfillStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          running: false,
        })
      );
      expect(mockDeps.notifyFailureSnackbar).toHaveBeenCalled();
    });

    test("When not initialized and loadStatus called, Then no action", async () => {
      // Arrange
      orchestrator.cleanup();
      mockDeps.loadBackfillStatus.mockClear();

      // Act
      await orchestrator.loadStatus();

      // Assert
      expect(mockDeps.loadBackfillStatus).not.toHaveBeenCalled();
    });
  });

  describe("Given backfill actions", () => {
    beforeEach(() => {
      orchestrator.initialize();
      mockDeps.loadBackfillStatus.mockClear();
    });

    test("When handleAction called with start, Then action is performed", async () => {
      // Act
      await orchestrator.handleAction("start");

      // Assert
      expect(mockDeps.handleBackfillAction).toHaveBeenCalledWith("start", {});
    });

    test("When handleAction succeeds, Then status is reloaded", async () => {
      // Act
      await orchestrator.handleAction("stop");

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledWith({
        announce: true,
        includeLog: true,
      });
    });

    test("When handleAction called, Then activity indicator is shown", async () => {
      // Act
      await orchestrator.handleAction("clear");

      // Assert
      expect(mockDeps.beginRequestActivity).toHaveBeenCalledWith("backfill");
    });

    test("When handleAction fails, Then error is rendered", async () => {
      // Arrange
      const error = new Error("Action failed");
      mockDeps.handleBackfillAction.mockRejectedValueOnce(error);

      // Act
      await orchestrator.handleAction("start");

      // Assert
      expect(mockDeps.renderBackfillStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          running: false,
        })
      );
      expect(mockDeps.notifyFailureSnackbar).toHaveBeenCalled();
    });

    test("When not initialized and handleAction called, Then no action", async () => {
      // Arrange
      orchestrator.cleanup();
      mockDeps.handleBackfillAction.mockClear();

      // Act
      await orchestrator.handleAction("start");

      // Assert
      expect(mockDeps.handleBackfillAction).not.toHaveBeenCalled();
    });
  });

  describe("Given status refresh", () => {
    beforeEach(() => {
      orchestrator.initialize();
      mockDeps.loadBackfillStatus.mockClear();
    });

    test("When refreshStatus called, Then status loaded with announce", async () => {
      // Act
      await orchestrator.refreshStatus();

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledWith({
        announce: true,
        includeLog: true,
      });
    });

    test("When refreshStatus called with custom options, Then options merged", async () => {
      // Act
      await orchestrator.refreshStatus({ announce: false });

      // Assert
      expect(mockDeps.loadBackfillStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          announce: false,
          includeLog: true,
        })
      );
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

      // Assert - verify loadStatus doesn't work after cleanup
      await orchestrator.loadStatus();
      expect(mockDeps.loadBackfillStatus).not.toHaveBeenCalled();
    });
  });
});
