const {
  createReviewStatsTabOrchestrator,
} = require("./review-stats-tab.orchestrator.js");

describe("Review Stats Tab Orchestrator", () => {
  let mockDeps;
  let orchestrator;

  beforeEach(() => {
    // Create mock dependencies
    mockDeps = {
      renderStatsView: jest.fn(),
      activateDataTab: jest.fn(),
      getOptionalElementById: jest.fn(),
      stateGetters: {
        getStatsViewState: jest.fn(() => ({
          sortBy: "riskyApprovals",
          filterMode: "all",
          topN: 12,
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        })),
        getLatestRows: jest.fn(() => []),
        getLatestActorsMap: jest.fn(() => ({})),
      },
      stateSetters: {
        setStatsViewState: jest.fn(),
      },
    };

    // Create orchestrator instance
    orchestrator = createReviewStatsTabOrchestrator(mockDeps);
  });

  describe("Given orchestrator is created", () => {
    test("When checking API, Then all methods are defined", () => {
      expect(orchestrator.initialize).toBeDefined();
      expect(orchestrator.render).toBeDefined();
      expect(orchestrator.handleDateRangeChange).toBeDefined();
      expect(orchestrator.handleFilterChange).toBeDefined();
      expect(orchestrator.activateTab).toBeDefined();
      expect(orchestrator.updateData).toBeDefined();
      expect(orchestrator.cleanup).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.render).toBe("function");
      expect(typeof orchestrator.handleDateRangeChange).toBe("function");
      expect(typeof orchestrator.handleFilterChange).toBe("function");
      expect(typeof orchestrator.activateTab).toBe("function");
      expect(typeof orchestrator.updateData).toBe("function");
      expect(typeof orchestrator.cleanup).toBe("function");
    });
  });

  describe("Given orchestrator initialization", () => {
    test("When initialize called, Then orchestrator is ready", () => {
      // Act
      orchestrator.initialize();

      // Assert - verify initialization doesn't error
      expect(orchestrator).toBeDefined();
    });

    test("When initialize called twice, Then no side effects", () => {
      // Act
      orchestrator.initialize();
      orchestrator.initialize();

      // Assert - verify no errors
      expect(orchestrator).toBeDefined();
    });
  });

  describe("Given tab activation", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });
    });

    test("When activateTab called, Then activateDataTab helper called with review-stats", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.activateDataTab).toHaveBeenCalledWith("review-stats");
      expect(mockDeps.activateDataTab).toHaveBeenCalledTimes(1);
    });

    test("When activateTab called, Then render is triggered", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.renderStatsView).toHaveBeenCalled();
    });
  });

  describe("Given rendering", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });
    });

    test("When render called, Then renderStatsView called with rows and actorsMap", () => {
      // Arrange
      const mockRows = [{ prNumber: 123 }];
      const mockActorsMap = { user1: "User One" };
      mockDeps.stateGetters.getLatestRows.mockReturnValue(mockRows);
      mockDeps.stateGetters.getLatestActorsMap.mockReturnValue(mockActorsMap);

      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderStatsView).toHaveBeenCalledWith(mockRows, mockActorsMap);
    });

    test("When render called without container element, Then early return", () => {
      // Arrange
      mockDeps.getOptionalElementById.mockReturnValue(null);

      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderStatsView).not.toHaveBeenCalled();
    });

    test("When not initialized and render called, Then no rendering", () => {
      // Arrange
      orchestrator.cleanup(); // Uninitialize

      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderStatsView).not.toHaveBeenCalled();
    });
  });

  describe("Given date range changes", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });
    });

    test("When handleDateRangeChange called, Then state updated", () => {
      // Act
      orchestrator.handleDateRangeChange({
        startDate: "2024-06-01",
        endDate: "2024-06-30",
      });

      // Assert
      expect(mockDeps.stateSetters.setStatsViewState).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: "2024-06-01",
          endDate: "2024-06-30",
        })
      );
    });

    test("When handleDateRangeChange called, Then render triggered", () => {
      // Act
      orchestrator.handleDateRangeChange({
        startDate: "2024-07-01",
        endDate: "2024-07-31",
      });

      // Assert
      expect(mockDeps.renderStatsView).toHaveBeenCalled();
    });

    test("When not initialized and handleDateRangeChange called, Then no action", () => {
      // Arrange
      orchestrator.cleanup();

      // Act
      orchestrator.handleDateRangeChange({ startDate: "2024-08-01" });

      // Assert
      expect(mockDeps.stateSetters.setStatsViewState).not.toHaveBeenCalled();
    });
  });

  describe("Given filter changes", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });
    });

    test("When handleFilterChange called with sortBy, Then state updated", () => {
      // Act
      orchestrator.handleFilterChange({ sortBy: "reviewTime" });

      // Assert
      expect(mockDeps.stateSetters.setStatsViewState).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: "reviewTime",
        })
      );
    });

    test("When handleFilterChange called with multiple options, Then all merged", () => {
      // Act
      orchestrator.handleFilterChange({
        sortBy: "approvalCount",
        filterMode: "active",
        topN: 20,
      });

      // Assert
      expect(mockDeps.stateSetters.setStatsViewState).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: "approvalCount",
          filterMode: "active",
          topN: 20,
        })
      );
    });

    test("When handleFilterChange called, Then render triggered", () => {
      // Act
      orchestrator.handleFilterChange({ topN: 15 });

      // Assert
      expect(mockDeps.renderStatsView).toHaveBeenCalled();
    });

    test("When not initialized and handleFilterChange called, Then no action", () => {
      // Arrange
      orchestrator.cleanup();

      // Act
      orchestrator.handleFilterChange({ sortBy: "reviewTime" });

      // Assert
      expect(mockDeps.stateSetters.setStatsViewState).not.toHaveBeenCalled();
    });
  });

  describe("Given data updates", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });
    });

    test("When updateData called, Then render triggered", () => {
      // Arrange
      const mockRows = [{ prNumber: 456 }];
      const mockActorsMap = { user2: "User Two" };

      // Act
      orchestrator.updateData(mockRows, mockActorsMap);

      // Assert
      expect(mockDeps.renderStatsView).toHaveBeenCalled();
    });

    test("When not initialized and updateData called, Then no action", () => {
      // Arrange
      orchestrator.cleanup();
      mockDeps.renderStatsView.mockClear();

      // Act
      orchestrator.updateData([], {});

      // Assert
      expect(mockDeps.renderStatsView).not.toHaveBeenCalled();
    });
  });

  describe("Given cleanup", () => {
    test("When cleanup called, Then orchestrator marked as uninitialized", () => {
      // Arrange
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "pr-stats" });

      // Act
      orchestrator.cleanup();

      // Assert - verify render doesn't work after cleanup
      orchestrator.render();
      expect(mockDeps.renderStatsView).not.toHaveBeenCalled();
    });
  });
});
