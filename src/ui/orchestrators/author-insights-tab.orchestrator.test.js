const {
  createAuthorInsightsTabOrchestrator,
} = require("./author-insights-tab.orchestrator.js");

describe("Author Insights Tab Orchestrator", () => {
  let mockDeps;
  let orchestrator;

  beforeEach(() => {
    // Create mock dependencies
    mockDeps = {
      renderAuthorInsights: jest.fn(),
      activateDataTab: jest.fn(),
      getOptionalElementById: jest.fn(),
      stateGetters: {
        getAuthorInsightsState: jest.fn(() => ({
          selectedAuthorLogin: "",
          latestRows: null,
          latestActorsMap: null,
        })),
        getLatestStoredPayload: jest.fn(() => ({ entries: [] })),
        getLatestSelectedRepo: jest.fn(() => "test-repo"),
      },
      stateSetters: {
        setSelectedAuthorLogin: jest.fn(),
        setLatestRows: jest.fn(),
        setLatestActorsMap: jest.fn(),
      },
    };

    // Create orchestrator instance
    orchestrator = createAuthorInsightsTabOrchestrator(mockDeps);
  });

  describe("Given orchestrator is created", () => {
    test("When checking API, Then all methods are defined", () => {
      expect(orchestrator.initialize).toBeDefined();
      expect(orchestrator.render).toBeDefined();
      expect(orchestrator.handleAuthorSelection).toBeDefined();
      expect(orchestrator.activateTab).toBeDefined();
      expect(orchestrator.updateData).toBeDefined();
      expect(orchestrator.cleanup).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.render).toBe("function");
      expect(typeof orchestrator.handleAuthorSelection).toBe("function");
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
      mockDeps.getOptionalElementById.mockReturnValue({ id: "tab-panel-author-insights" });
    });

    test("When activateTab called, Then activateDataTab helper called with author-insights", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.activateDataTab).toHaveBeenCalledWith("author-insights");
      expect(mockDeps.activateDataTab).toHaveBeenCalledTimes(1);
    });

    test("When activateTab called, Then render is triggered", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.renderAuthorInsights).toHaveBeenCalled();
    });
  });

  describe("Given rendering", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "tab-panel-author-insights" });
    });

    test("When render called, Then renderAuthorInsights component called", () => {
      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderAuthorInsights).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.any(Object),
          selectedRepo: "test-repo",
          authorInsightsState: expect.any(Object),
        })
      );
    });

    test("When render called with selectedAuthorLogin, Then passed to component", () => {
      // Act
      orchestrator.render({ selectedAuthorLogin: "testuser" });

      // Assert
      expect(mockDeps.renderAuthorInsights).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthorLogin: "testuser",
        })
      );
    });

    test("When render called without container element, Then early return", () => {
      // Arrange
      mockDeps.getOptionalElementById.mockReturnValue(null);

      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderAuthorInsights).not.toHaveBeenCalled();
    });

    test("When not initialized and render called, Then no rendering", () => {
      // Arrange
      orchestrator.cleanup(); // Uninitialize

      // Act
      orchestrator.render();

      // Assert
      expect(mockDeps.renderAuthorInsights).not.toHaveBeenCalled();
    });
  });

  describe("Given author selection", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "tab-panel-author-insights" });
    });

    test("When handleAuthorSelection called, Then state updated", () => {
      // Act
      orchestrator.handleAuthorSelection("johndoe");

      // Assert
      expect(mockDeps.stateSetters.setSelectedAuthorLogin).toHaveBeenCalledWith("johndoe");
    });

    test("When handleAuthorSelection called, Then render triggered with selection", () => {
      // Act
      orchestrator.handleAuthorSelection("janedoe");

      // Assert
      expect(mockDeps.renderAuthorInsights).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedAuthorLogin: "janedoe",
        })
      );
    });

    test("When not initialized and handleAuthorSelection called, Then no action", () => {
      // Arrange
      orchestrator.cleanup();

      // Act
      orchestrator.handleAuthorSelection("testuser");

      // Assert
      expect(mockDeps.stateSetters.setSelectedAuthorLogin).not.toHaveBeenCalled();
    });
  });

  describe("Given data updates", () => {
    beforeEach(() => {
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "tab-panel-author-insights" });
    });

    test("When updateData called with rows, Then state updated", () => {
      // Arrange
      const mockRows = [{ prNumber: 123 }];
      const mockActorsMap = { user1: "User One" };

      // Act
      orchestrator.updateData({}, mockRows, mockActorsMap);

      // Assert
      expect(mockDeps.stateSetters.setLatestRows).toHaveBeenCalledWith(mockRows);
      expect(mockDeps.stateSetters.setLatestActorsMap).toHaveBeenCalledWith(mockActorsMap);
    });

    test("When updateData called, Then render triggered", () => {
      // Act
      orchestrator.updateData({}, [], {});

      // Assert
      expect(mockDeps.renderAuthorInsights).toHaveBeenCalled();
    });

    test("When not initialized and updateData called, Then no action", () => {
      // Arrange
      orchestrator.cleanup();

      // Act
      orchestrator.updateData({}, [], {});

      // Assert
      expect(mockDeps.stateSetters.setLatestRows).not.toHaveBeenCalled();
    });
  });

  describe("Given cleanup", () => {
    test("When cleanup called, Then orchestrator marked as uninitialized", () => {
      // Arrange
      orchestrator.initialize();
      // Mock DOM element
      mockDeps.getOptionalElementById.mockReturnValue({ id: "tab-panel-author-insights" });

      // Act
      orchestrator.cleanup();

      // Assert - verify render doesn't work after cleanup
      orchestrator.render();
      expect(mockDeps.renderAuthorInsights).not.toHaveBeenCalled();
    });
  });
});
